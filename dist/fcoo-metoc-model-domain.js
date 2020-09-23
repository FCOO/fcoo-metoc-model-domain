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
;
/****************************************************************************
    fcoo-metoc-model-domain.js,

    (c) 2020, FCOO

    https://github.com/FCOO/fcoo-metoc-model-domain
    https://github.com/FCOO

****************************************************************************/

(function ($, i18next, moment, window/*, document, undefined*/) {
    "use strict";

    //Create fcoo-namespace
    var ns = window.fcoo = window.fcoo || {},
        nsModel = ns.model = ns.model || {};

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

    var roundEpochMomentTo = 15; //minutes

    /****************************************************************************
    ModelList
    ****************************************************************************/
    function ModelList(options) {
        this.options = $.extend({
            metaDataDuration: 15,
            metaDataPath    : 'https://app.fcoo.dk/dynamic/',
            metaDataFileName: 'metadata.json'
        }, options);

        this.options.metaDataFileName = this.options.metaDataPath + this.options.metaDataFileName;
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

            //Create Interval to read metadata for all domains every X minutes
            window.intervals.addInterval({
                duration: this.options.metaDataDuration,
                fileName: this.options.metaDataFileName,
                context : this,
                resolve : nsModel.ModelList.prototype.resolveMetaData,
                reject  : nsModel.ModelList.prototype.reject
            });
        },

        /*********************************************
        resolveMetaData - reading json-file with all metadata
        *********************************************/
        resolveMetaData: function(data, interval){
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
            var _this = this;
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
        this.options = options;
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
            type          : model.options.type || 'met',
            owner         : this.model.options.domainOwner || '',
            area          : "regional",
            resolution    : "1nm",
            period        : model.domainPeriod || 6,
            process       : 3*60,
            epochOffset   : 0
        }, options);
        this.options.abbr = this.options.abbr || this.options.id;
        this.options.name = this.options.name || this.options.abbr;
        switch (this.options.area){
            case "global": this.options.areaName = {da:'Global',   en:'Global'  }; break;
            case "local" : this.options.areaName = {da:'Lokal',    en:'Local'   }; break;
            default      : this.options.areaName = {da:'Regional', en:'Regional'}; break;
        }
        this.options.ncFileName = this.model.modelList.options.metaDataPath + options.nc;
        this.isGlobal = (options.area == 'global');
    }
    nsModel.Domain = Domain;

    nsModel.Domain.prototype = {
        /*********************************************
        fullName
        *********************************************/
        fullName: function(){
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
            var newEpoch = data.epoch ? moment(data.epoch) : moment(this.lastModified.utc()).floor(this.options.period, 'hours').add(2, 'hours'); //FORKERT AUTOMATISK BEREGNING AF EPOCH. NÅR EPOCH KOMMER MED I NC-FILERNE FJERNES DET HER

            if (!this.epoch || !this.epoch.isSame(newEpoch)){
                //It is a new epoch
                this.epoch = newEpoch;
                this.nextEpoch = moment( this.epoch ).add(this.options.period, 'hours');

                //Calc expected next update
                /* OLD VERSION
                this.expectedNextUpdate =
                    moment( this.lastModified )
                        .add(this.options.period, 'hours')
                        .add(roundEpochMomentTo, 'minutes')
                        .ceil(roundEpochMomentTo, 'minutes');
                */
                this.expectedNextUpdate =
                    moment( this.nextEpoch )
                        .add(this.options.process, 'minutes')
                        .ceil(roundEpochMomentTo, 'minutes');


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

            return this.nextEpoch.diff( now  );

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
                    text = text + ' '+ i18next.sentence(relText);
                }
                return {label: label, type: 'textarea', text: text, center: true};
            }
            //*****************************************************

            $container.empty();

            var content = [];

            if (!this.ageOk)
                content.push({
                    type     : 'textarea',
                    center   : true,
                    icon     : 'far fa-eye-slash',
                    iconClass: 'font-weight-bold text-danger',
                    text     : [
                        {da: 'VISES IKKE', en: 'NOT SHOWN'},
                        '<br>',
                        {da:'Forklaring mangler', en:'Missing explanation'}
                    ],
                    textClass: ['font-weight-bold text-danger', '', '']
                });


            content.push(momentAsText({da: 'Opdateret', en:'Updated'}, this.lastModified, true));

            var label = {da: 'Forventet næste opdatering', en:'Expected next update'};
            if (this.status.delayed)
                content.push({
                    label: label, type: 'textarea', center: true, textClass: 'font-weight-bold text-warning', text: {da: 'FORSINKET', en: 'DELAYED'}
                });
            else
                content.push( momentAsText(label, this.expectedNextUpdate, true));

            content.push(momentAsText({da: 'Prognosen går frem til', en:'The forecast ends at'}, this.LastTime, 'EXACT'));


            content.push( abbrAndName( this.options.owner,    null,              null,              {da:'Ejer/Distributør', en: 'Owner/Distributor' } ));
            content.push( abbrAndName( this.model.options.id, null,              null,              {da:'Model',            en: 'Model'             } ));
            content.push( abbrAndName( this.options.abbr,     this.options.name, this.options.link, {da:'Område/Opsætning', en: 'Domain/Setting'    }, i18next.s(this.options.areaName)+' =' ));


            content.push({
                type      : 'textarea',
                label     : {da: 'Opdatering og Opløsning', en:'Updating and Resolution'},
                text      : {
                    da: 'Prognosen opdateres hver ' + this.options.period +'. time<br>Den horisontale opløsning i prognosen er '+ this.options.resolution,
                    en: 'The forecast is updated every ' + this.options.period +' hours<br>The horizontal resolution is '+ this.options.resolution
                },
                textClass : 'text-center',
                //lineBefore: true,
                center    : true
            });

            $container._bsAppendContent(content);
        }
    };
}(jQuery, this.i18next, this.moment, this, document));