/****************************************************************************
fcoo-metoc-load.js,

Method to load all data regarding models, domains, domain-groups
****************************************************************************/
(function ($, window/*, document, undefined*/) {
    "use strict";

    //Create fcoo-namespace
    var ns = window.fcoo = window.fcoo || {},
        nsModel = ns.model = ns.model || {},
        nsParameter = ns.parameter = ns.parameter || {},
        nsModelOptions = nsModel.options = nsModel.options || {};

    /****************************************************************************
    Adding a 'empty' promise to fcoo.promiseList to detect if models and
    domain-groups should be loaded
    ****************************************************************************/
    ns.promiseList.appendFirst({
        data: {},
        resolve: function(){
            if (nsModelOptions.includeModel){
                //Create and load modelList
                nsModel.modelList = new nsModel.ModelList();
                ns.promiseList.append({
                    fileName: {subDir: nsModelOptions.modelList.dataSubDir, fileName: nsModelOptions.modelList.dataFileName},
                    resolve : $.proxy(nsModel.ModelList.prototype.resolve, nsModel.modelList)
                });

                //Create and load domainGroupList
                nsModel.domainGroupList = nsModel.domainGroupList || new window.fcoo.model.DomainGroupList();
                ns.promiseList.append({
                    fileName: {subDir: nsModelOptions.domainGroupList.dataSubDir, fileName: nsModelOptions.domainGroupList.dataFileName},
                    resolve : $.proxy(nsModel.DomainGroupList.prototype.resolve, nsModel.domainGroupList)
                });

                //Load and update relations between parameters and domainGroups
                ns.promiseList.append({
                    fileName: {subDir: nsModelOptions.domainGroupList.dataSubDir, fileName: nsModelOptions.domainGroupList.parameterFileName},
                    resolve : function( data ){
                        $.each(nsParameter, function(index, parameter){
                            if (parameter instanceof nsParameter.Parameter)
                                parameter._getDomainGroup(data);
                        });
                    }
                });
            }
        }
    });

}(jQuery, this, document));
;
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
        nsModel = ns.model = ns.model || {},
        nsModelOptions = nsModel.options = nsModel.options || {};

    /****************************************************************************
    fcoo.model.options.domainGroupList
    default options for fcoo.model.modelDomainGroupList
    ****************************************************************************/
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

    nsModelOptions = $.extend(true, nsModelOptions, {
        domainGroupList: {
            updateDuration   :  5,                  //Interval between updating the info (minutes)
            maxAbsoluteAge   : 48,                  //Max age (=now - epoch) for a domain
            maxParentAge     : 10,                  //Max age-different between a children-domain and its parent-domain
            maxSiblingAge    :  8,                  //Max age-different between domains on same level with differnet priority
            mapOptions       : defaultMapOptions,
            mapContainerStyle: {},                  //Extra styles for the map-container
            mapLayers        : [],                   //Leflet-layer to be added to the map. Eq. Open Street Map
            modelList        : null,                //instance of ModelList
            helpId           : '',

            //data located in file under sub-dir 'static' contains all the groups
            dataSubDir       : 'model-domain',
            dataFileName     : 'model-domain-group.json',
            parameterFileName: 'model-domain-group-parameter.json'
        }
    });

    /****************************************************************************
    Common variables for all domain-groups
    ****************************************************************************/
    var warningIcon = ['fas fa-circle _back text-warning', 'far fa-exclamation-circle'],
        infoIcon    = $.bsHeaderIcons.info;

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
    fcoo.model.showDomainGroup(id, header, mapCenter, mapZoom)
    Show modal with info and map for specific model-group
    ****************************************************************************/
    nsModel.showDomainGroup = function(id, header, mapCenter, mapZoom){
        var domainGroup = nsModel.domainGroupList.groups[id];
        if (domainGroup)
            domainGroup.asModal(header, mapCenter, mapZoom);
    };

    /****************************************************************************
    DomainGroupList
    ****************************************************************************/
    function DomainGroupList(options) {
        this.options = $.extend(true, {}, nsModelOptions.domainGroupList, options || {});
        this.list      = [];
        this.groups    = {};
        this.modelList = [];
        this.onResolve = []; //[]FUNCTION(domainGroupList) to be called every time meta-data are resolved/read
    }
    nsModel.DomainGroupList = DomainGroupList;

    nsModel.DomainGroupList.prototype = {
        /*********************************************
        resolve
        *********************************************/
        resolve: function(data){
            var _this = this;
            //data = []DomainGroup-options or {options, list}
            var dataList = [];
            if ($.isPlainObject(data)){
                this.options = $.extend(true, this.options, data.options || {});
                dataList = data.list || [];
            }
            else
                dataList = data;

            this.modelList = nsModel.modelList;
            $.each(dataList, function(index, domainGroupOptions){
                _this.addDomainGroup(domainGroupOptions);
            });

            if (nsModelOptions.staticMode)
                this.updateAll();
            else
                nsModel.modelList.onResolve.push(
                    $.proxy(nsModel.DomainGroupList.prototype.updateAll, this)
                );
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
        updateAll: function(){
            var _this = this;

            $.each(this.list, function(index, domainGroup){
                domainGroup.update();
            });

            //Call onResolve
            $.each(this.onResolve, function(index, func){
                func(_this);
            });

            //If it is the firste time => add interval to update all domainGroups every updateDuration minutes
            if (!nsModelOptions.staticMode && !this.intervalAdded){
                this.intervalAdded = true;
                window.intervals.addInterval({
                    duration: this.options.updateDuration,
                    data    : {},
                    context : this,
                    resolve : nsModel.DomainGroupList.prototype.updateAll
                });
            }
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

            //If not static-mode => update age and sort by it
            if (!nsModelOptions.staticMode){
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
            }

            //If this is the domainGroup displayed in modal => update content of the modal
            if (ns._mmd.current == this)
                this.asModal(ns._mmd.header);

            $.each(this.onUpdate, function(index, func){
                func(_this);
            });
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
                    //Set style of selected/not-selected polygon
                    var isOcean = this.type == 'ocean';
                    item.polygon.setStyle({
                        transparent    : !selected || !isOcean,
                        weight         : selected && !isOcean ? 3 : 1,
                        borderColorName: (selected && !isOcean) || !this.ageOk ? 'black' : this.colorName,
                    });
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

                if (!nsModelOptions.staticMode){
                    if (!ageOk)
                        icons.push(['fas fa-circle text-danger', 'far fa-exclamation-circle']);
                    else
                        if (domain.status.delayed)
                            icons.push(warningIcon);
                        else
                            icons.push('far fa-check-circle');
                }
                if (ageOk){
                    if (this.errorLoadingMask)
                        icons.push(['far fa-square fa-sm', 'far fa-slash']);
                    else
                        icons.push(['fas fa-square-full text-'+domainGroupItem.colorName, 'far fa-square-full']);
                }
                else
                    icons.push('far fa-eye-slash');

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
        this.ageOk       = true;
        this.mask        = this.isGlobal ? '' : options.mask || this.domain.options.mask;
        this.errorLoadingMask = false;


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
                if (!this.errorLoadingMask)
                    //Load polygons from json-file
                    Promise.getJSON(
                        ns.dataFilePath({subDir:'model-domain', fileName:this.domain.options.mask}), {
                        useDefaultErrorHandler: false,
                        resolve: $.proxy(this.addPolygon, this),
                        reject : $.proxy(this.rejectPolygon, this)
                    });
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
                colorName       : this.ageOk ? this.colorName : 'gray',//'white',
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

        rejectPolygon: function(){
            this.errorLoadingMask = true;
            //Reload the modal if this is part of current domain-group
            if (ns._mmd.current == this.domainGroup)
                this.domainGroup.asModal(ns._mmd.header);

        },


        /*********************************************
        _polygon_onClick
        *********************************************/
        _polygon_onClick: function(){
            this.domainGroup._updateModalMap( this );
        }

    };
}(jQuery, L, this.i18next, this.moment, this, document));
;
/****************************************************************************
fcoo-metoc-model-domain.js,

Objects and methods to create and manage list of models
****************************************************************************/
(function ($, i18next, moment, window/*, document, undefined*/) {
    "use strict";

    //Create fcoo-namespace
    var ns = window.fcoo = window.fcoo || {},
        nsModel = ns.model = ns.model || {},
        nsModelOptions = nsModel.options = nsModel.options || {};

    nsModelOptions = $.extend(true, nsModelOptions, {
        includeModel: true,     //If true all models and domain-groups are loaded and created
        staticMode  : false,    //If true no metadata from nc-filer are loaded and no dynamic info in modal-window
        model: {
            roundEpochMomentTo  : 15 //minutes
        },
        modelList: {
            metaDataDuration : 15,  //Minuts between reload of metadata

            //data located in file under sub-dir 'static' contains all the groups
            dataSubDir       : 'model-domain',
            dataFileName     : 'model-domain.json',

            //metadata located in file under sub-dir 'dynamic' contains info on the different netCDF-files associated with each model-domain
            metaDataSubDir   : 'model-domain',
            metaDataFileName : 'model-domain-metadata.json'
        }
    });

    /****************************************************************************
    ModelList
    ****************************************************************************/
    function ModelList(options) {
        this.options = $.extend(true, {}, nsModelOptions.modelList, options || {});
        this.list   = [];
        this.models = {};
        this.onResolve = []; //[]FUNCTION(modelList) to be called every time meta-data are resolved/read
    }
    nsModel.ModelList = ModelList;

    nsModel.ModelList.prototype = {
        /*********************************************
        getDomain
        *********************************************/
        getDomain: function(modelId, domainId){
            var result = null;
            $.each(this.models, function(id, model){
                if (id == modelId){
                    result = model.getDomain(domainId);
                    return false;
                }
            });
            return result;
        },

        /*********************************************
        resolve - create all models and domains
        *********************************************/
        resolve: function(data){
            var _this = this;
            $.each(data, function(index, modelOpt){
                var newModel = new Model(modelOpt, _this);
                _this.list.push( newModel );
                _this.models[newModel.options.id] = newModel;
            });
            if (!nsModelOptions.staticMode)
                //Create Interval to read metadata for all domains every X minutes
                window.intervals.addInterval({
                    duration: this.options.metaDataDuration,
                    fileName: {mainDir: true, subDir: nsModelOptions.modelList.metaDataSubDir, fileName: nsModelOptions.modelList.metaDataFileName},
                    context : this,
                    resolve : nsModel.ModelList.prototype.resolveMetaData,
                    reject  : nsModel.ModelList.prototype.reject
                });
        },

        /*********************************************
        resolveMetaData - reading json-file with all metadata
        *********************************************/
        resolveMetaData: function(data, interval){
            var _this = this;

            //Update all domains in all models. model.resolve return the lowest duration to next epoch or expected ready for its domains
            var lowestDurationToNextReload = 0;
            $.each(this.list, function(index, model){
                var modelLowest = model.resolve(data);
                lowestDurationToNextReload = index ? Math.min(lowestDurationToNextReload, modelLowest) : modelLowest;
            });

            if (lowestDurationToNextReload > 0){
                //Convert from millisec to the duration unit used by the Interval
                interval.paus( moment.duration(lowestDurationToNextReload).as(interval.options.durationUnit) );
            }

            //Call onResolve
            $.each(this.onResolve, function(index, func){
                func(_this);
            });
        },

        /*********************************************
        reject
        *********************************************/
        reject: function(/*error, interval*/){
            //Retry to read nc-file 3 times with 1 minutes interval MANGLER
        },

        /*********************************************
        visitAllDomains( domainFunc )
        domainFunc = FUNCTION(domain)
        *********************************************/
        visitAllDomains: function(domainFunc){
            $.each(this.list, function(index, model){
                $.each(model.domainList, function(index2, domain){
                    domainFunc(domain);
                });
            });
        }
    };

    /****************************************************************************
    Model
    ****************************************************************************/
    function Model(options, modelList) {
        var _this = this;
        this.options = $.extend(true, {}, nsModelOptions.model, options || {});
        this.modelList = modelList;
        this.domainList = [];
        this.domains = {};
        $.each(options.domain, function(index, domainOpt){
            var newDomain = new Domain(domainOpt, _this);
            _this.domainList.push( newDomain );
            _this.domains[newDomain.options.id] = newDomain;
        });
    }
    nsModel.Model = Model;

    nsModel.Model.prototype = {

        /*********************************************
        getDomain
        *********************************************/
        getDomain: function(domainId){
            var result = null;
            $.each(this.domains, function(id, domain){
                if (id == domainId){
                    result = domain;
                    return false;
                }
            });
            return result;
        },

        /*********************************************
        resolve - reading json-file with all metadata
        *********************************************/
        resolve: function(data){
            //Update all domains in this Each domain return duration to next epoch or expected update
            var lowestDurationToNextReload = 0;
            $.each(this.domainList, function(index, domain){
                var domainLowest = domain.resolve(data);
                lowestDurationToNextReload = index ? Math.min(lowestDurationToNextReload, domainLowest) : domainLowest;
            });
            return lowestDurationToNextReload;
        }
    };

    /****************************************************************************
    Domain
    ****************************************************************************/
    function Domain(options, model) {
        this.model = model;
        this.options = $.extend({
            type                : this.model.options.type || 'met',
            owner               : this.model.options.domainOwner || '',
            area                : "regional",
            resolution          : "1nm",
            period              : model.domainPeriod || 6,
            process             : 3*60,
            epochOffset         : 0,
            roundEpochMomentTo  : this.model.options.roundEpochMomentTo
        }, options);
        this.options.abbr = this.options.abbr || this.options.id;
        this.options.name = this.options.name || this.options.abbr;
        switch (this.options.area){
            case "global": this.options.areaName = {da:'Global',   en:'Global'  }; break;
            case "local" : this.options.areaName = {da:'Lokal',    en:'Local'   }; break;
            default      : this.options.areaName = {da:'Regional', en:'Regional'}; break;
        }
        this.isGlobal = (options.area == 'global');
    }
    nsModel.Domain = Domain;

    nsModel.Domain.prototype = {
        /*********************************************
        fullName
        *********************************************/
        fullName: function(){
            //**************************************
            function getShortName(id){
                var idLower = id.toLowerCase(),
                    nameExists = i18next.exists('name:'+idLower),
                    linkExists = i18next.exists('link:'+idLower);
                return {
                    text : id.toUpperCase(),
                    title: nameExists ? 'name:'+idLower : null,
                    link : linkExists ? 'link:'+idLower : null
                };
            }
            //**************************************
            var result = [];
            if (this.options.owner)
                result.push(
                    getShortName(this.options.owner),
                    '/'
                );
            result.push(
                getShortName(this.model.options.abbr),
                '/',
                {text: this.options.name, link: this.options.url}
            );
            return result;
        },

        fullNameSimple: function(){
            var result = '';
            $.each([this.options.owner, this.model.options.id, this.options.abbr], function(index, text){
                if (text)
                    result = result + (result ? '&nbsp;/&nbsp;' : '') + text.toUpperCase();
            });
            result = result + '&nbsp;(' + i18next.s(this.options.areaName) + ')';
            return result;
        },

        /*********************************************
        resolve - reading nc-metadata
        *********************************************/
        resolve: function(allData){
            var _this = this,
                durationToNextReload = null;

            $.each(allData, function(ncPathAndFileName, data){
                if (ncPathAndFileName.split('/').pop() != _this.options.nc)
                    return true;
                durationToNextReload = _this.resolveData(data);
                return false;
            });
            return durationToNextReload;
        },

        resolveData: function(data){
            var _this = this;
            //NOT USED var durationToNextEpoch = null;
            this.lastModified = moment(data.last_modified);
            var newEpoch = moment(data.epoch);
            if (!newEpoch.isValid())
                newEpoch = moment(this.lastModified.utc()).floor(this.options.period, 'hours').add(2, 'hours'); //FORKERT AUTOMATISK BEREGNING AF EPOCH. NÅR EPOCH KOMMER MED I NC-FILERNE FJERNES DET HER

            if (!this.epoch || !this.epoch.isSame(newEpoch)){
                //It is a new epoch
                this.epoch = newEpoch;
                this.nextEpoch = moment( this.epoch ).add(this.options.period, 'hours');

                //Calc expected next update
                /* OLD VERSION
                this.expectedNextUpdate =
                    moment( this.lastModified )
                        .add(this.options.period, 'hours')
                        .add(this.options.roundEpochMomentTo, 'minutes')
                        .ceil(this.options.roundEpochMomentTo, 'minutes');
                */
                this.expectedNextUpdate =
                    moment( this.nextEpoch )
                        .add(this.options.process, 'minutes')
                        .ceil(this.options.roundEpochMomentTo, 'minutes');


                //Find first and last forecast time
                $.each(data, function(id, paramOptions){
                    if ($.isPlainObject(paramOptions) && paramOptions.time){
                        _this.firstTime = moment(paramOptions.time[0]);
                        _this.LastTime  = moment(paramOptions.time.pop());
                        return false;
                    }
                });
            }

            this.update();

            //Calc duration until next epoch or expected update in milliseconds
            var now = moment.utc().startOf('minute');

            return this.nextEpoch.diff( now );

            /*NOT USED:
            var durationToNextUpdate = this.expectedNextUpdate.diff( now  );
            //It both next ecpoh and next update are in the past => return 0 => just wait for next interval (15 min)
            if ((durationToNextEpoch <= 0) || (durationToNextUpdate <= 0)) return 0;
            //Else return the smallest > 0 value
            else if ((durationToNextEpoch <= 0) && (durationToNextUpdate > 0)) return durationToNextUpdate;
            else if ((durationToNextEpoch > 0) && (durationToNextUpdate <= 0)) return durationToNextEpoch;
            else return Math.min(durationToNextEpoch, durationToNextUpdate);
            */
        },

        /*********************************************
        reject - error when reading nc-metadata
        *********************************************/
        reject: function(/*error, interval*/){
            this.update();
        },

        /*********************************************
        update - update info on the domain in this.status
        *********************************************/
        update: function(){
            var nowHour = moment().floor(1, 'hours');
            this.status = {
                epoch: moment(this.epoch),
                age  : Math.max(0, nowHour.diff(this.epoch, 'hours'))
            };
            this.status.delayed = this.expectedNextUpdate.isBefore( moment() );
        },

        /*********************************************
        createDetailContent - create bs-content with details
        *********************************************/
        createDetailContent: function( $container ){
            //*****************************************************
            function replaceSpace( text ){
                return text.replace(/ /g, '&nbsp;');
            }
            //*****************************************************
            function abbrAndName( id, name, link, label, prefix, postfix ){
                var idLower    = id.toLowerCase(),
                    abbr       = i18next.exists('name:abbr') ? i18next.t('name:abbr') : id.toUpperCase();

                name =  i18next.exists('name:'+idLower) ?
                        i18next.t('name:'+idLower) :
                        ($.isPlainObject(name) ? i18next.s(name) : name) || abbr;

                var textList = prefix ? [prefix] : [],
                    linkList = prefix ? [''] : [];

                if (link || i18next.exists('link:'+idLower))
                    linkList.push(link || 'link:'+idLower);

                textList.push(name);
                if (name && (name.toUpperCase() !== abbr.toUpperCase()))
                    textList.push('(' + abbr + ')');

                if (postfix)
                    textList.push(postfix);

                return {
                    type     : 'textarea',
                    class    : 'info-box',
                    label    : label,
                    text     : textList,
                    textClass:'text-center',
                    link     : linkList,
                    center   : true
                };
            }
            //*****************************************************
            function momentAsText( label, m, inclRelative ){
                var text =
                    $('<span/>')
                        .vfFormat('datetime_format', {dateFormat: {weekday:'None', month:'Short', year:'Short'}})
                        .vfValue(m)
                        .text();

                if (inclRelative){
                    var diff      = m.diff( moment().startOf(1, 'hours'), 'minutes'),
                        roundDiff = Math.round(diff/60),
                        relText = {da: '(Nu)', en:'(Now)'};

                    if (inclRelative == 'EXACT'){
                        var days  = Math.floor(diff / 60 / 24),
                            hours = Math.round(diff/60 - days*24);
                        if ((days > 0) || (hours > 0)){
                            relText = {
                                da: '(' + (days > 0 ? days + (days > 1 ? ' dage' : ' dag') : ''),
                                en: '(' + (days > 0 ? days + (days > 1 ? ' days' : ' day') : '')
                            };
                            if (hours > 0){
                                if (days > 0){
                                    relText.da = relText.da + ' og ';
                                    relText.en = relText.en + ' and ';
                                }
                                relText.da = relText.da + hours + (hours > 1 ? ' timer' : ' time');
                                relText.en = relText.en + hours + (hours > 1 ? ' hours' : ' hour');
                            }
                            relText.da = relText.da + ')';
                            relText.en = relText.en + ')';
                        }
                    }
                    else {
                        if (roundDiff == 0){
                            //Special case: less that one hour from/to the moment
                            relText = diff > 0 ?
                                      {da: "(lige om lidt)",   en: "(shortly)"  } :
                                      {da: "(for lidt siden)", en: "(recently)" };
                        }
                        else {
                            var absDiff = Math.abs(roundDiff),
                                sing    = absDiff == 1;
                            if (diff > 0)
                                relText = {
                                    da: '(om ca. '+absDiff + (sing ? ' time':' timer')+')',
                                    en: '(in app. '+absDiff + (sing ? ' hour':' hours')+')'
                                };
                            else
                                relText = {
                                    da: '(for ca. '+absDiff + (sing ? ' time':' timer')+' siden)',
                                    en: '(app. '+absDiff + (sing ? ' hour':' hours')+' ago)'
                                };
                        }
                    }
                    text = replaceSpace(text) + (ns._mmd.onlyExtraWidth ? '<br>' : ' ') + replaceSpace(i18next.sentence(relText));
                }
                return {
                    label : label,
                    class : 'info-box',
                    type  : 'textarea',
                    text  : text,
                    center: true
                };
            }
            //*****************************************************

            $container.empty();

            var content = [];

            if (!nsModelOptions.staticMode){
                if (!this.ageOk)
                    content.push({
                        type     : 'textarea',
                        center   : true,
                        icon     : 'far fa-eye-slash',
                        iconClass: 'font-weight-bold text-danger',
                        text     : [
                            {da: replaceSpace('VISES IKKE'), en: replaceSpace('NOT SHOWN')},
                            {da: replaceSpace('Prognosen er ikke tilgængelig'), en: replaceSpace('The forecast is not available')}
                        ],
                        textClass: ['font-weight-bold text-danger', 'text-danger']
                    });

                content.push(momentAsText({da: 'Opdateret', en:'Updated'}, this.lastModified, true));

                var label = {da: 'Forventet næste opdatering', en:'Expected next update'};
                if (this.status.delayed)
                    content.push({
                        label : label,
                        class : 'info-box',
                        type  : 'textarea',
                        center: true,
                        textClass: 'font-weight-bold text-warning',
                        text: {da: 'FORSINKET', en: 'DELAYED'}
                    });
                else
                    content.push( momentAsText(label, this.expectedNextUpdate, true));

                content.push(momentAsText({da: 'Prognosen går frem til', en:'The forecast ends at'}, this.LastTime, 'EXACT'));
            }

            content.push( abbrAndName( this.options.owner,    null,              null,              {da:'Ejer/Distributør', en: 'Owner/Distributor' } ));
            content.push( abbrAndName( this.model.options.id, null,              null,              {da:'Model',            en: 'Model'             } ));
            content.push( abbrAndName( this.options.abbr,     this.options.name, this.options.link, {da:'Område/Opsætning', en: 'Domain/Setting'    }, i18next.s(this.options.areaName)+' =' ));

            if (nsModelOptions.staticMode)
                content.push({
                    type      : 'textarea',
                    label     : {da: 'Opløsning', en:'Resolution'},
                    text      : {
                        da: 'Den horisontale opløsning i prognosen er ' + this.options.resolution,
                        en: 'The horizontal resolution is '             + this.options.resolution
                    },
                    textClass : 'text-center',
                    center    : true
                });
            else
                content.push({
                    type      : 'textarea',
                    label     : {da: 'Opdatering og Opløsning', en:'Updating and Resolution'},
                    text      : {
                        da: 'Prognosen opdateres hver '      + this.options.period +'. time og den horisontale opløsning i prognosen er ' + this.options.resolution,
                        en: 'The forecast is updated every ' + this.options.period +' hours and the horizontal resolution is '             + this.options.resolution
                    },
                    textClass : 'text-center',
                    center    : true
                });

            $container._bsAppendContent(content);
        }
    };
}(jQuery, this.i18next, this.moment, this, document));
;
/****************************************************************************
fcoo-parameter-unit-extend.js

Extend Parameter from fcoo-parameter-unit with method to
find the cooresponding model-group and to show the modal window with info
on the model-group
****************************************************************************/
(function ($/*, window, document, undefined*/) {
    "use strict";

    //Create fcoo-namespace
    var ns = window.fcoo = window.fcoo || {},
        nsParameter = ns.parameter = ns.parameter || {},
        nsModel = ns.model = ns.model || {};

    $.extend(nsParameter.Parameter.prototype, {
        _getDomainGroup: function( data ){
            //Find the related domain-group from the relations in data
            var this_id = this.id,
                this_group = this.group,
                this_domainGroupId = null;

            $.each(data, function(domainGroupId, domainGroupParameters){

                //Check if this.id is listed in domainGroupParameters.id
                if (domainGroupParameters.id && (domainGroupParameters.id.indexOf(this_id) > -1))
                    this_domainGroupId = domainGroupId;

                //Check if this.group is listed in domainGroupParameters.group
                if (domainGroupParameters.group && (domainGroupParameters.group.indexOf(this_group) > -1))
                    this_domainGroupId = this_domainGroupId || domainGroupId;

            });

            this.domainGroup = nsModel.domainGroupList.groups[this_domainGroupId] || null;
        },

        domainGroupAsModal: function(center, zoom){
            if (this.domainGroup)
                this.domainGroup.asModal(this.name, center, zoom);
        }

    });
}(jQuery, this, document));