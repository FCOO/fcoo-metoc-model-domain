/****************************************************************************
    fcoo-metoc-model-domain-group.js

    (c) 2020, FCOO

    https://github.com/FCOO/fcoo-metoc-model-domain
    https://github.com/FCOO

****************************************************************************/

(function ($, L, i18next, moment, window/*, document, undefined*/) {
    "use strict";

    //Create fcoo-namespace
    var ns = window.fcoo = window.fcoo || {},
        nsModel = ns.model = ns.model || {};


    var warningIcon = ['fas fa-circle _back text-warning', 'far fa-exclamation-circle'],
        infoIcon    = $.bsHeaderIcons.info;

    var mapOptions = {
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


    /****************************************************************************
    DomainGroupList
    ****************************************************************************/
    function DomainGroupList(options, list) {
        this.options = $.extend({
            updateDuration: 5,      //Interval between updating the info (minutes)

            maxAbsoluteAge : 48, //Max age (=now - epoch) for a domain
            maxParentAge   : 10, //Max age-different between a children-domain and its parent-domain
            maxSiblingAge  :  8, //Max age-different between domains on same level with differnet priority

        }, options);

        this.list = [];
        this.groups = {};
        this.modelList = options.modelList;
        this.modelList.onResolve.push( $.proxy(this.updateAll, this) );

        var _this = this;
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
    }
    nsModel.DomainGroupList = DomainGroupList;

    nsModel.DomainGroupList.prototype = {
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

    var domainGroup = {
            current : null,     //The current DomainGroup being shown in domainGroup.modal
            modal   : null,     //bsModal to show status for a DomainGroup
            header  : '',       //The latest header used

            //Variables to hold different parts of the map inside the modal. A common map is reused for all groups
            map          : null,
            $mapContainer: null,
            $accordion   : null,

            layerGroup   : null, //The leaflet.layerGroup with all mpolygons
        };

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
            if (domainGroup.current == this)
                this.asModal(domainGroup.header);

            $.each(this.onUpdate, function(index, func){ func(_this); });
        },

        /*********************************************
        asModal - Show status for all domains in the group
        *********************************************/
        asModal: function(header){
            domainGroup.header = header;
            if (domainGroup.modal){
                domainGroup.modal.update(
                    this._modalContent(
                        header,
                        domainGroup.current == this ? domainGroup.$accordion.bsAccordionStatus() : null
                    )
                );
            }
            else
                domainGroup.modal = $.bsModal(this._modalContent(header));

            domainGroup.$accordion = domainGroup.modal.bsModal.$body.find('.BSACCORDION');
            domainGroup.current = this;
            domainGroup.modal.show();
            domainGroup.map.invalidateSize();
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
                    domainGroup.$accordion.bsOpenCard(index);
                }

                if (item.isGlobal && !item.ageOk) return;

                if (item.isGlobal){
                    domainGroup.$mapContainer.css('box-shadow', selected ? '0 0 6px 1px ' + item.colorName : 'none');
                    if (selected)
                        domainGroup.map.setZoom( domainGroup.map.getMinZoom(), {animate: false} );
                }

                if (item.polygon){
                    item.polygon.setStyle({transparent: !selected});
                    if (selected)
                        domainGroup.map.fitBounds(item.polygon.getBounds(), {_maxZoom: domainGroup.map.getZoom()});
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

            //Create common map-element
            if (domainGroup.$mapContainer)
                domainGroup.$mapContainer.detach();
            else {
                //Create the info-map. NB: Hard-coded color for the sea!!!
                domainGroup.$mapContainer =
                    $('<div/>')
                        .css({
                            'height'          : '300px',
                            'width'           : '100%',
                            'background-color': '#C9E9F7',
                            'border'          : '3px solid transparent'
                        });

                domainGroup.map = L.map(domainGroup.$mapContainer.get(0), mapOptions);

                domainGroup.map.setView([56.2, 11.5], 6);

                L.tileLayer.wms('https://{s}.fcoo.dk/mapproxy/service', {
                    layers: "land-iho_latest",
                    styles: "",
                    errorTileUrl: "https://tiles.fcoo.dk/tiles/empty_512.png",
                    format: "image/png",
                    subdomains: ["wms01", "wms02", "wms03", "wms04"],
                    tileSize: 512,
                    transparent: true,
                    zIndex: 800,

                    minZoom: mapOptions.minZoom,
                    maxZoom: mapOptions.maxZoom
                }).addTo(domainGroup.map);


                // Top layer (coastline + place names)
                L.tileLayer.wms('https://{s}.fcoo.dk/mapproxy/service', {
                    layers: 'top-dark_latest',
                    styles: "",
                    errorTileUrl: "https://tiles.fcoo.dk/tiles/empty_512.png",
                    format: "image/png",
                    subdomains: ["wms01", "wms02", "wms03", "wms04"],
                    tileSize: 512,
                    transparent: true,
                    zIndex: 1000,
                    minZoom: mapOptions.minZoom,
                    maxZoom: mapOptions.maxZoom
                }).addTo(domainGroup.map);

                //Create layerGroup to hole all polygons
                domainGroup.layerGroup = L.layerGroup().addTo(domainGroup.map);

                //Create new pan with zIndex < the map to hole all polygons fra ocean-domains
                var ocnPane = domainGroup.map.createPane('oceanPane');
                $(ocnPane).css('zIndex', 1);

            }

            //Clean the layer with polygons and add the one from this
            domainGroup.$mapContainer.css({
                'border-color': 'transparent',
                'box-shadow'  : 'none'
            });
            domainGroup.layerGroup.clearLayers();

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
                    icons.push(['fas fa-square-full text-'+domainGroupItem.colorName, 'far fa-square-full YTtext-dark']);

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
                flexWidth: true,
                header   : {
                    icon: this.warning ? [warningIcon] : infoIcon,
                    text: header || this.options.name
                },
                onClose  : function(){ domainGroup.current = null; return true; },
                content  : {
                    type     : 'accordion',
                    onChange : $.proxy(this._accordion_onChange, this),
                    multiOpen: true,
                    allOpen  : !mainAccordionStatus,
                    items: [{
                        header : {da: 'Oversigtskort', en:'Overview Map'},
                        isOpen : mainAccordionStatus && mainAccordionStatus[0],

                        content: domainGroup.$mapContainer
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
                domainGroup.$mapContainer.css('border-color', this.colorName);
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
            }).addTo(domainGroup.layerGroup);

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