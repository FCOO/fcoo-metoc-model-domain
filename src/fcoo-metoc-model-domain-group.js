/****************************************************************************
    fcoo-metoc-model-domain-group.js

    (c) 2020, FCOO

    https://github.com/FCOO/fcoo-metoc-model-domain
    https://github.com/FCOO

****************************************************************************/

(function ($, L, i18next, moment, window, document, undefined) {
    "use strict";

    //Create fcoo-namespace
    var ns = window.fcoo = window.fcoo || {},
        nsModel = ns.model = ns.model || {};


    /****************************************************************************
    fcoo.model.createDomainGroupList(fileName, options)
    Load and create fcoo.model.domainGroupList
    options = {
        updateDuration   : 5,                  //Interval between updating the info (minutes)
        maxAbsoluteAge   : 48,                 //Max age (=now - epoch) for a domain
        maxParentAge     : 10,                 //Max age-different between a children-domain and its parent-domain
        maxSiblingAge    :  8,                 //Max age-different between domains on same level with differnet priority
        mapOptions       : defaultMapOptions,
        mapContainerStyle: {},                  //Extra styles for the map-container
        mapLayers        : []Leflet-layer to be added to the map. Eq. Open Street Map
        modelList        : instance of ModelList
        helpId           : ''


    ****************************************************************************/
    nsModel.createDomainGroupList = function(options){
        nsModel.domainGroupList = new DomainGroupList(options);
    };

    /****************************************************************************
    fcoo.model.showDomainGroup(id, header, mapCenter, mapZoom)
    ****************************************************************************/
    nsModel.showDomainGroup = function(id, header, mapCenter, mapZoom){
        var domainGroup = nsModel.domainGroupList.groups[id];
        if (domainGroup)
            domainGroup.asModal(header, mapCenter, mapZoom);
    };



    /****************************************************************************
    DomainGroupList
    ****************************************************************************/
    var warningIcon = ['fas fa-circle _back text-warning', 'far fa-exclamation-circle'],
        infoIcon    = $.bsHeaderIcons.info;

    var defaultMapOptions = {
            zoomControl         : false,
            attributionControl  : false,    //Use bsAttributionControl instead of default attribution-control
            bsAttributionControl: true,

            closePopupOnClick   : true,	    //true	Set it to false if you don't want popups to close when user clicks the map.
            boxZoom             : false,    //true	Whether the map can be zoomed to a rectangular area specified by dragging the mouse while pressing the shift key.
            doubleClickZoom     : true,	    //true	Whether the map can be zoomed in by double clicking on it and zoomed out by double clicking while holding shift. If passed 'center', double-click zoom will zoom to the center of the view regardless of where the mouse was.
            dragging            : true,     //true	Whether the map be draggable with mouse/touch or not.
            zoomSnap            : .25,	    //1	Forces the map's zoom level to always be a multiple of this, particularly right after a fitBounds() or a pinch-zoom. By default, the zoom level snaps to the nearest integer; lower values (e.g. 0.5 or 0.1) allow for greater granularity. A value of 0 means the zoom level will not be snapped after fitBounds or a pinch-zoom.
            zoomDelta           : .25,	    //1	Controls how much the map's zoom level will change after a zoomIn(), zoomOut(), pressing + or - on the keyboard, or using the zoom controls. Values smaller than 1 (e.g. 0.5) allow for greater granularity.
            trackResize         : false,	//true	Whether the map automatically handles browser window resize to update itself.
            minZoom             : 2,        //Minimum zoom level of the map. If not specified and at least one GridLayer or TileLayer is in the map, the lowest of their minZoom options will be used instead.
            maxZoom	            : 7        //Maximum zoom level of the map. If not specified and at least one GridLayer or TileLayer is in the map, the highest of their maxZoom options will be used instead.

        };

    //colorNameList = []COLORNAME = different colors for domains
    var colorNameList = ["red", "green", "orange", "cyan", "purple", "brown", "black", "grey", "pink", "yellow", "blue", "white"],
        globalColorName = "darkblue";

    //ns._mmd = record with current object used in displaying the status of the domain-groups and there domains
    ns._mmd = {
            current : null,     //The current DomainGroup being shown in domainGroup.modal
            modal   : null,     //bsModal to show status for a DomainGroup
            header  : '',       //The latest header used

            //Variables to hold different parts of the map inside the modal. A common map is reused for all groups
            map          : null,
            $mapContainer: null,
            $accordion   : null,

            layerGroup   : null, //The leaflet.layerGroup with all mpolygons

            //Detect device and screen-size and set
            extraWidth   : window.fcoo.modernizrDevice.isDesktop || window.fcoo.modernizrDevice.isTablet
        };
        ns._mmd.megaWidth  = ns._mmd.extraWidth && (Math.min(ns.modernizrMediaquery.screen_height, ns.modernizrMediaquery.screen_width) >= 920);
        ns._mmd.onlyExtraWidth = ns._mmd.extraWidth && !ns._mmd.megaWidth;



    /****************************************************************************
    DomainGroupList
    ****************************************************************************/
    function DomainGroupList(options, list) {
        this.options = $.extend(true, {
            updateDuration: 5,      //Interval between updating the info (minutes)

            maxAbsoluteAge: 48, //Max age (=now - epoch) for a domain
            maxParentAge  : 10, //Max age-different between a children-domain and its parent-domain
            maxSiblingAge :  8, //Max age-different between domains on same level with differnet priority

            mapOptions    : defaultMapOptions,
            mapLayers     : []  //Leaflet-layer = layers to be added to the map
        }, options);

        this.list = [];
        this.groups = {};
        this.modelList = options.modelList;
        this.modelList.onResolve.push( $.proxy(this.updateAll, this) );

        if (list)
            this.resolve(list);

    }
    nsModel.DomainGroupList = DomainGroupList;

    nsModel.DomainGroupList.prototype = {
        /*********************************************
        resolve
        *********************************************/
        resolve: function(data){
            var _this = this;

            //data = []DomainGroup-options or {options, list}
            var list = [];
            if ($.isPlainObject(data)){
                this.options = $.extend(true, this.options, data.options || {});
                list = data.list || [];
            }
            else
                list = data;

            $.each(list || [], function(index, domainGroupOptions){
                _this.addDomainGroup(domainGroupOptions);
            });

            //Update all domainGroups every updateDuration minutes, but wait for first updateAll called by this.modelList.onResolve
            this.waitingForModelList = true;
            window.intervals.addInterval({
                duration: this.options.updateDuration,
                data    : {checkForWaiting: true},
                context : this,
                resolve : nsModel.DomainGroupList.prototype.updateAll
            });
        },

        /*********************************************
        addDomainGroup
        *********************************************/
        addDomainGroup: function(options){
            var domainGroup = new nsModel.DomainGroup(options, this);
            this.list.push( domainGroup );
            this.groups[domainGroup.options.id] = domainGroup;
        },

        /*********************************************
        updateAll
        *********************************************/
        updateAll: function(options){
            if (options && options.checkForWaiting && this.waitingForModelList)
                return;
            this.waitingForModelList = false;
            $.each(this.list, function(index, domainGroup){ domainGroup.update(); });
        },
    };

    /****************************************************************************
    DomainGroup
    ****************************************************************************/
    function DomainGroup(options, domainGroupList) {
        this.options = $.extend({
            maxAbsoluteAge: domainGroupList.options.maxAbsoluteAge, //Max age (=now - epoch) for a domain
            maxParentAge  : domainGroupList.options.maxParentAge,   //Max age-different between a children-domain and its parent-domain
            maxSiblingAge : domainGroupList.options.maxSiblingAge,  //Max age-different between domains on same level with differnet priority

            helpId : domainGroupList.options.helpId
        }, options);

        this.domainGroupList = domainGroupList;
        this.modelList = domainGroupList.modelList;
        this.list      = [];
        this.onUpdate  = []; //[]FUNCTION(DomainGroup) - called when any of the associated domains are updated

        var _this = this;
        $.each(options.subdomains || [], function(index, domainItemOptions){
            _this.addItem(domainItemOptions, null, _this);
        });
    }
    nsModel.DomainGroup = DomainGroup;

    nsModel.DomainGroup.prototype = {
        /*********************************************
        addItem
        *********************************************/
        addItem: function(options, parent){
            this.list.push( new DomainGroupItem(options, parent, this) );
        },

        /*********************************************
        update
        *********************************************/
        update: function(){
            var _this = this;
            this.warning = false; //true if any of its domains is delayed or to old

            //Sort by level
            this.list.sort(function(item1, item2){ return item2.level - item1.level; });

            //Sort by level and initial priority
            this.list.sort(function(item1, item2){
                return (item1.level - item2.level) || (item2.options.priority - item1.options.priority);
            });

            //Add colorNames (first time)
            var nextColorNameIndex = 0;
            if (!this.list[0].colorName)
                $.each(this.list, function(index, item){
                    item.colorName = item.isGlobal ? globalColorName : colorNameList[nextColorNameIndex++ % colorNameList.length];
                });

            //Check all domains if they are to old compared with there parent
            $.each(this.list, function(index, dommainGroupItem){
                dommainGroupItem.setAgeOk();
                _this.warning = _this.warning || !dommainGroupItem.ageOk || dommainGroupItem.domain.status.delayed;
            });


            //For each level: Check all domains if they are to old compared with there siblings
            $.each(this.list, function(index, dommainGroupItem){
                dommainGroupItem.currentPriority = dommainGroupItem.options.priority*1000; //*1000 => make room between siblings
            });
            $.each(this.list, function(index, dommainGroupItem){
                if (dommainGroupItem.ageOk)
                    $.each(_this.list, function(index, sibling){
                        if (
                            (sibling !== dommainGroupItem) &&               //It is another item,..
                            (sibling.level == dommainGroupItem.level) &&    //.. at same level
                            (sibling.ageOk ) &&                             //..witch is not to old
                            ((dommainGroupItem.age - sibling.age) > dommainGroupItem.options.maxSiblingAge) //..and this is to old compare to sibling
                        )
                            dommainGroupItem.currentPriority =              //Set priority below sibling
                                Math.min(
                                    dommainGroupItem.currentPriority,
                                    sibling.currentPriority - 500 + dommainGroupItem.options.priority
                                );
                    });
                else
                    dommainGroupItem.currentPriority = dommainGroupItem.options.priority; //Moving the domainItem last within the level
            });

            //Sort by level and current priority
            this.list.sort(function(item1, item2){
                return (item1.level - item2.level) || (item2.currentPriority - item1.currentPriority);
            });


            //If this is the domainGroup displayed in modal => update content of the modal
            if (ns._mmd.current == this)
                this.asModal(ns._mmd.header);

            $.each(this.onUpdate, function(index, func){ func(_this); });
        },

        /*********************************************
        asModal - Show status for all domains in the group
        *********************************************/
        asModal: function(header, mapCenter, mapZoom){
            ns._mmd.header = header;
            if (ns._mmd.modal){
                ns._mmd.modal.update(
                    this._modalContent(
                        header,
                        ns._mmd.current == this ? ns._mmd.$accordion.bsAccordionStatus() : null
                    )
                );
            }
            else
                ns._mmd.modal = $.bsModal(this._modalContent(header));

            ns._mmd.$accordion = ns._mmd.modal.bsModal.$body.find('.BSACCORDION');
            ns._mmd.current = this;

            if (mapCenter != undefined)
                ns._mmd.map.setView(mapCenter);
            if (mapZoom != undefined)
                ns._mmd.map.setZoom(mapZoom);

            ns._mmd.modal.show();
            ns._mmd.map.invalidateSize();
        },

        /*********************************************
        _accordion_onChange - Update the polygons in the map in the modal
        *********************************************/
        _accordion_onChange: function(accordion, status){
            if (this.doNotUpdateMap){
                this.doNotUpdateMap = false;
                return;
            }
            //The 'open' domain (if any) is set in second status
            var currentIndex = null;
            if (status && status[1])
                for (var i=0; i<status[1].length; i++)
                    if (status[1][i])
                        currentIndex = i;
            this._updateModalMap( currentIndex == null ? null : this.list[currentIndex] );
        },

        /*********************************************
        _updateModalMap - Update the accordion and polygon in the modal
        *********************************************/
        _updateModalMap: function( selectedItem ){
            $.each(this.list, function(index, item){
                var selected = (item == selectedItem);

                if (selected){
                    this.doNotUpdateMap = true;
                    ns._mmd.$accordion.bsOpenCard(index);
                }

                if (item.isGlobal && !item.ageOk) return;

                if (item.isGlobal){
                    ns._mmd.$mapContainer.css('box-shadow', selected ? '0 0 6px 1px ' + item.colorName : 'none');
                    if (selected)
                        ns._mmd.map.setZoom( ns._mmd.map.getMinZoom(), {animate: false} );
                }

                if (item.polygon){
                    item.polygon.setStyle({transparent: !selected});
                    if (selected)
                        ns._mmd.map.fitBounds(item.polygon.getBounds(), {_maxZoom: ns._mmd.map.getZoom()});
                }
            });
        },

        /*********************************************
        _modalContent - Return the modal content for all domains
        *********************************************/
        _modalContent: function(header, accordionStatus){
            var accordionItems = [],
                mainAccordionStatus = null,
                domainAccordionStatus = null;

            if (accordionStatus){
                mainAccordionStatus   = accordionStatus;
                domainAccordionStatus = accordionStatus[1];
            }

            //Detect device and screen-size and set
            var mapHeight = 300 + (ns._mmd.extraWidth ? 100 : 0) + (ns._mmd.megaWidth ? 100 : 0);

            //Create common map-element
            if (ns._mmd.$mapContainer)
                ns._mmd.$mapContainer.detach();
            else {
                //Create the info-map. NB: Hard-coded color for the sea!!!
                ns._mmd.$mapContainer =
                    $('<div/>')
                        .css({
                            'height': mapHeight + 'px',
                            'width' : '100%',
                            'border': '3px solid transparent'
                        }).
                        css(this.domainGroupList.options.mapContainerStyle || {});

                var mapOptions = this.domainGroupList.options.mapOptions;
                ns._mmd.map = L.map(ns._mmd.$mapContainer.get(0), mapOptions);

                ns._mmd.$mapContainer.resize( function(){
                    ns._mmd.map.invalidateSize();
                });

                ns._mmd.map.setView([56.2, 11.5], 6);

                var layerList = this.domainGroupList.options.mapLayers;
                $.each( $.isArray(layerList) ? layerList : [layerList], function(index, layer){
                    layer.addTo(ns._mmd.map);
                });

                //Create layerGroup to hole all polygons
                ns._mmd.layerGroup = L.layerGroup().addTo(ns._mmd.map);

                //Create new pan with zIndex < the map to hole all polygons fra ocean-domains
                var ocnPane = ns._mmd.map.createPane('oceanPane');
                $(ocnPane).css('zIndex', 1);

            }

            //Clean the layer with polygons and add the one from this
            ns._mmd.$mapContainer.css({
                'border-color': 'transparent',
                'box-shadow'  : 'none'
            });
            ns._mmd.layerGroup.clearLayers();

            //Add each domainGroupItem to the list
            $.each(this.list, function(index, domainGroupItem){
                var domain = domainGroupItem.domain,
                    icons = [], //1. Status, 2. color on info-map or not-shown
                    ageOk = this.ageOk;

                if (!ageOk)
                    icons.push(['fas fa-circle text-danger', 'far fa-exclamation-circle']);
                else
                    if (domain.status.delayed)
                        icons.push(warningIcon);
                    else
                        icons.push('far fa-check-circle');

                if (!ageOk)
                    icons.push('far fa-eye-slash');
                else
                    icons.push(['fas fa-square-full text-'+domainGroupItem.colorName, 'far fa-square-full']);

                accordionItems.push({
                    id     : 'index_'+index,
                    isOpen : domainAccordionStatus && domainAccordionStatus[index],
                    header : {
                        icon     : icons,
                        iconClass: window.bsIsTouch ? ['', 'fa-fw'] : ['fa-lg', 'fa-lg fa-fw'],
                        text     : domain.fullNameSimple()
                    }                                ,
                    content: $.proxy(domain.createDetailContent, domain),
                });
            });

            //Add each domainGroupItem to the map. Need to sort first to get domains with high priority over domains with low priority
            //Sort by level and revers priority
            this.list.sort(function(item1, item2){
                return (item1.level - item2.level) || (item1.currentPriority - item2.currentPriority);
            });
            //Add polygon (if ageOk and not global) to the overview map
            $.each(this.list, function(index, domainGroupItem){
                domainGroupItem.addToMap();
            });
            //Sort back
            this.list.sort(function(item1, item2){
                return (item1.level - item2.level) || (item2.currentPriority - item1.currentPriority);
            });

            var result = {
                    flexWidth : true,
                    extraWidth: ns._mmd.extraWidth,
                    megaWidth : ns._mmd.megaWidth,
                    modalContentClassName: ns._mmd.megaWidth ? 'mdg-mega-width' : ns._mmd.extraWidth ? 'mdg-extra-width' : '',
                    header   : {
                        icon: this.warning ? [warningIcon] : infoIcon,
                        text: header || this.options.name
                    },
                    onClose  : function(){ ns._mmd.current = null; return true; },
                    content  : {
                        type     : 'accordion',
                        onChange : $.proxy(this._accordion_onChange, this),
                        multiOpen: true,
                        allOpen  : !mainAccordionStatus,
                        items: [{
                            header : {da: 'Oversigtskort', en:'Overview Map'},
                            isOpen : mainAccordionStatus && mainAccordionStatus[0],

                            content: ns._mmd.$mapContainer
                        }, {
                            header : {da:'Prognoser', en:'Forecasts'},
                            isOpen : mainAccordionStatus && mainAccordionStatus[1],
                            content: {
                                type: 'accordion',
                                items: accordionItems
                            }
                        }]
                    },
                    helpId    : this.options.helpId,
                    helpButton: true
                };
            return result;
        }
    };

    /****************************************************************************
    DomainGroupItem
    Represent one Domain in one DomainGroup with relations to parent and/or children
    domains and setting for prioritize the domain
    ****************************************************************************/
    function DomainGroupItem(options, parent, domainGroup) {
        var _this = this;
        this.options = $.extend({
            priority: 0,
            maxAbsoluteAge: domainGroup.options.maxAbsoluteAge, //Max age (=now - epoch) for a domain
            maxParentAge  : domainGroup.options.maxParentAge,   //Max age-different between a children-domain and its parent-domain
            maxSiblingAge : domainGroup.options.maxSiblingAge   //Max age-different between domains on same level with differnet priority
        }, options);

        this.parent      = parent;
        this.level       = parent ? parent.level + 1 : 0;
        this.domainGroup = domainGroup;
        this.domain      = domainGroup.modelList.getDomain(options.modelId, options.domainId);
        this.type        = options.type || this.domain.options.type;
        this.isGlobal    = (options.area == 'global') || this.domain.isGlobal;
        this.mask        = this.isGlobal ? '' : options.mask || this.domain.options.mask;
        $.each(options.subdomains || [], function(index, domainItemOptions){
            domainGroup.addItem(domainItemOptions, _this, domainGroup);
        });
    }
    nsModel.DomainGroupItem = DomainGroupItem;

    nsModel.DomainGroupItem.prototype = {
        /*********************************************
        setAgeOk
        *********************************************/
        setAgeOk: function(){
            var domain = this.domain;

            this.age   = domain.status.age;
            this.ageOk = (this.age < this.options.maxAbsoluteAge);
            this.domain.ageOk = this.ageOk;
            if (this.ageOk){
                //Check against all parent
                var parent = this.parent;
                while (parent && !parent.ageOk)
                    parent = parent.parent;

                if (parent && (this.age - parent.age > this.options.maxParentAge))
                    this.ageOk = false;
            }
        },

        /*********************************************
        addToMap
        Add polygon to the map in domainGroup-variable
        *********************************************/
        addToMap: function(){
            if (this.isGlobal && !this.ageOk) return;

            if (this.isGlobal){
                ns._mmd.$mapContainer.css('border-color', this.colorName);
                return;
            }

            if (this.latLngs)
                this.addPolygon();
            else
                //Load polygons from json-file
                Promise.getJSON( ns.dataFilePath({subDir:'model-domain', fileName:this.domain.options.mask}), {resolve: $.proxy(this.addPolygon, this)});
        },

        /*********************************************
        addPolygon
        *********************************************/
        addPolygon: function(geoJSON){
            if (geoJSON){
                var coordinates = geoJSON.features[0].geometry.coordinates,
                    indexOfBiggest = -1;
                $.each(coordinates, function(index, lngLats){
                    if ((indexOfBiggest == -1) || (lngLats.length > coordinates[indexOfBiggest]))
                        indexOfBiggest = index;
                });
                var latLngs = geoJSON.features[0].geometry.coordinates[indexOfBiggest];
                $.each(latLngs, function(index, lngLat){
                    latLngs[index] = [lngLat[1], lngLat[0]];
                });
            }

            this.latLngs = this.latLngs || latLngs;
            var isOcean = this.type == 'ocean';
            this.polygon = L.polygon(this.latLngs, {
                borderColorName : this.ageOk ? this.colorName : 'black',
                colorName       : this.ageOk ? this.colorName : 'white',
                transparent     : true,
                addInteractive  : true,
                border          : true,
                hover           : true,
                interactive     : true,
                pane            : isOcean ? 'oceanPane' : 'overlayPane',
            }).addTo(ns._mmd.layerGroup);

            this.polygon
                .on('click', $.proxy(this._polygon_onClick, this) )
                .bindTooltip(this.domain.fullNameSimple(), {sticky: true});
        },

        /*********************************************
        _polygon_onClick
        *********************************************/
        _polygon_onClick: function(){
            this.domainGroup._updateModalMap( this );
        }

    };
}(jQuery, L, this.i18next, this.moment, this, document));