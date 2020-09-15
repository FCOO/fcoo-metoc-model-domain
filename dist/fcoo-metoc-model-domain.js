/****************************************************************************
    fcoo-metoc-model-domain-group.js

    (c) 2020, FCOO

    https://github.com/FCOO/fcoo-metoc-model-domain
    https://github.com/FCOO

****************************************************************************/

(function ($, i18next, moment, window/*, document, undefined*/) {
    "use strict";

    //Create fcoo-namespace
    var ns = window.fcoo = window.fcoo || {},
        nsModel = ns.model = ns.model || {};

    /****************************************************************************
    *****************************************************************************
    DomainGroupList
    *****************************************************************************
    ****************************************************************************/
    function DomainGroupList(options, modelList) {
        this.list = [];
        this.groups = {};
        this.modelList = modelList;
    }

    // expose access to the constructor
    nsModel.DomainGroupList = DomainGroupList;

    //Extend the prototype
    nsModel.DomainGroupList.prototype = {
        /*********************************************
        addDomainGroup
        *********************************************/
        addDomainGroup: function(options){
            var domainGroup = new nsModel.DomainGroup(options, this.modelList);
            this.list.push( domainGroup );
            this.groups[domainGroup.options.id] = domainGroup;
        },
    };

    /****************************************************************************
    *****************************************************************************
    DomainGroup
    *****************************************************************************
    ****************************************************************************/
    //Create fictive DomainGroupItem
    var globalParentDomainItem = null;

    function DomainGroup(options, modelList) {
        this.options = $.extend({

        }, options);
        this.modelList = modelList;
        this.list    = [];
//        this.domains = {};

        //Create/get globalParentDomainItem = fictive domainGroupItem-parent for global-domains
        if (!globalParentDomainItem)
            globalParentDomainItem =
                new nsModel.DomainGroupItem(
                        {},
                        {options: {global: true}, status: {age: 0}},
                        this,
                        {level: -1}
                );

        //If no global domain is given => Create fictive global-domain
        var globalDomain = modelList.getDomain(options.modelId, options.domainId) ? null : {options: {global: true}, status: {age: 0}};
        this.list.push( new nsModel.DomainGroupItem(options, globalDomain, this, globalParentDomainItem) );

//HERconsole.log(this);
//HER        var globalDomain = modelList.getDomain(options.modelId, options.domainId)
//HERconsole.log(options, globalParent);
    }

    // expose access to the constructor
    nsModel.DomainGroup = DomainGroup;

    //Extend the prototype
    nsModel.DomainGroup.prototype = {


        /*********************************************
        resolve - create all models and domains
        *********************************************/
        resolve: function(/*data*/){
//HER            var _this = this;
        },

        /*********************************************
        reject
        *********************************************/
        reject: function(/*error, interval*/){
        }
    };


    /****************************************************************************
    *****************************************************************************
    DomainGroupItem
    Represent one Domain in one DomainGroup with relations to parent and/or children
    domains and setting for prioritize the domain
    *****************************************************************************
    ****************************************************************************/
    function DomainGroupItem(options, domain, domainGroup, parent) {
        var _this = this;
        this.options = $.extend({

        }, options);

        this.parent = parent;
        this.level = parent.level + 1;
        this.domain = domainGroup.modelList.getDomain(options.modelId, options.domainId) || domain;

        this.list = [];
        $.each(options.subdomains || [], function(index, domainItemOptions){
            var newDomainGroupItem = new nsModel.DomainGroupItem(domainItemOptions, null, domainGroup, _this);
            _this.list.push( newDomainGroupItem );
            domainGroup.list.push( newDomainGroupItem );
        });
    }

    // expose access to the constructor
    nsModel.DomainGroupItem = DomainGroupItem;

    //Extend the prototype
    nsModel.DomainGroupItem.prototype = {


    };

}(jQuery, this.i18next, this.moment, this, document));
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


    var roundEpochMomentTo = 15, //minutes
        maxAbsoluteAge     = 48, //Max age (=now - epoch) for a domain
        maxParentAge       = 10, //Max age-different between a children-domain and its parent-domain
        maxSiblingAge      =  8; //Max age-different between domains on same level with differnet priority

    /****************************************************************************
    *****************************************************************************
    ModelList
    *****************************************************************************
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
    }


    // expose access to the constructor
    nsModel.ModelList = ModelList;

    //Extend the prototype
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
//TEST: intervals.options.durationUnit = 'seconds';
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
//HERconsole.log('************** RESOLVE METADATA *******************');

            //Update all domains in all models. model.resolve return the lowest duration to next epoch or expected ready for its domains
            var lowestDurationToNextReload = 0;
            $.each(this.list, function(index, model){
                var modelLowest = model.resolve(data);
                lowestDurationToNextReload = index ? Math.min(lowestDurationToNextReload, modelLowest) : modelLowest;
            });

            if (lowestDurationToNextReload > 0){
//HERconsole.log('WAIT for', moment.duration(lowestDurationToNextReload).as(interval.options.durationUnit)/60, 'hours');
                //Convert from millisec to the duration unit used by the Interval
                interval.paus( moment.duration(lowestDurationToNextReload).as(interval.options.durationUnit) );
            }
            else
//HERconsole.log('RELOAD in', interval.options.duration, 'minutes');

window.afterLoad();

        },

        /*********************************************
        reject
        *********************************************/
        reject: function(/*error, interval*/){
            //Retry to read nc-file 3 times with 1 minutes interval MANGLER

        }
    };

    /****************************************************************************
    *****************************************************************************
    Model
    *****************************************************************************
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

    // expose access to the constructor
    nsModel.Model = Model;

    //Extend the prototype
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
    *****************************************************************************
    Domain
    *****************************************************************************
    ****************************************************************************/
    function Domain(options, model) {
        this.model = model;
        this.options = $.extend({
            owner         : this.model.options.domainOwner || '',
            global        : false,
            resolution    : "1nm",
            period        : model.domainPeriod || 6,
            epochOffset   : 0,
            maxAbsoluteAge: maxAbsoluteAge, //Max age (=now - epoch) for a domain
            maxParentAge  : maxParentAge,   //Max age-different between a children-domain and its parent-domain
            maxSiblingAge : maxSiblingAge   //Max age-different between domains on same level with differnet priority
        }, options);

        this.options.abbr = this.options.abbr || this.options.id;
        this.options.name = this.options.name || this.options.abbr;
        this.options.ncFileName = this.model.modelList.options.metaDataPath + options.nc;

window.test.push({header:this.fullNameSimple(), content: $.proxy(this.createDetailContent, this)});

    }

    // expose access to the constructor
    nsModel.Domain = Domain;

    //Extend the prototype
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
                    result = result + (result ? '/'/*'&nbsp;/&nbsp;'*/ : '') + text.toUpperCase();
            });
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
//NOT USED            var durationToNextEpoch = null;
            this.lastModified = moment(data.last_modified);
            var newEpoch = data.epoch ? moment(data.epoch) : moment(this.lastModified.utc()).floor(this.options.period, 'hours').add(2, 'hours'); //FORKERT AUTOMATISK BEREGNING AF EPOCH. NÅR EPOCH KOMMER MED I NC-FILERNE FJERNES DET HER

            if (!this.epoch || !this.epoch.isSame(newEpoch)){
                //It is a new epoch
                this.epoch = newEpoch;
                this.nextEpoch = moment( this.epoch ).add(this.options.period, 'hours');

                //Calc expected next update
                this.expectedNextUpdate =
                    moment( this.lastModified )
                        .add(this.options.period, 'hours')
                        .add(roundEpochMomentTo, 'minutes')
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
        _statusAsString - Return this.status as a string
        *********************************************/
        _statusAsString: function(){
            if (this.status)
                return (this.status.epoch ? this.status.epoch.format() : '') + this.status.delayed + this.status.visible + this.status.age;
            return '';
        },

        /*********************************************
        update - update info on the domain in this.status
        *********************************************/
        update: function(){
            var lastStatusAsString = this._statusAsString(),
                nowHour = moment().floor(1, 'hours');

            this.status = {
                epoch: moment(this.epoch),
                age  : nowHour.diff(this.epoch, 'hours')
            };

            this.status.delayed = this.expectedNextUpdate.isBefore( moment() );

            //Set needToUpdateStatus. It is set to false when "someone" has updated the status
            this.needToUpdateStatus = this.needToUpdateStatus || (lastStatusAsString != this._statusAsString());
        },

        /*********************************************
        createDetailContent - create bs-content with details
        *********************************************/
        createDetailContent: function( $container ){
            //*****************************************************
            function abbrAndName( id, name, link, label ){
                var idLower    = id.toLowerCase(),
                    abbr       = i18next.exists('name:abbr') ? i18next.t('name:abbr') : id.toUpperCase();

                name =  i18next.exists('name:'+idLower) ?
                        i18next.t('name:'+idLower) :
                        ($.isPlainObject(name) ? i18next.s(name) : name) || abbr;

                var textList = [name];
                if (name && (name.toUpperCase() !== abbr.toUpperCase()))
                    textList.push('(' + abbr + ')');

                return {
                    type     : 'textarea',
                    label    : label,
                    text     : textList,
                    textClass:'text-center',
                    link     : [link || (i18next.exists('link:'+idLower) ? 'link:'+idLower : '')],
                    center   : true
                };
            }
            //*****************************************************
            function momentAsText( label, m, inclRelative ){
                var text =
                    $('<span/>')
                        .vfFormat('datetime')
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
                                      {da: "(Lige om lidt)",   en: "(Shortly)"  } :
                                      {da: "(For lidt siden)", en: "(Recently)" };
                        }
                        else {
                            var absDiff = Math.abs(roundDiff),
                                sing    = absDiff == 1;
                            if (diff > 0)
                                relText = {
                                    da: '(Om ca. '+absDiff + (sing ? ' time':' timer')+')',
                                    en: '(In app. '+absDiff + (sing ? ' hour':' hours')+')'
                                };
                            else
                                relText = {
                                    da: '(For ca. '+absDiff + (sing ? ' time':' timer')+' siden)',
                                    en: '(App. '+absDiff + (sing ? ' hour':' hours')+' ago)'
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

            content.push(momentAsText({da: 'Opdateret', en:'Updated'}, this.lastModified, true));

            var label = {da: 'Forventet næste opdatering', en:'Expected next update'};
            if (this.status.delayed)
                content.push({
                    label: label, type: 'textarea', center: true, textClass: 'font-weight-bold text-danger', text: {da: 'FORSINKET', en: 'DELAYED'}
                });
            else
                content.push( momentAsText(label, this.expectedNextUpdate, true));

            content.push(momentAsText({da: 'Prognosen går frem til', en:'The forecast end at'}, this.LastTime, 'EXACT'));


            content.push( abbrAndName( this.options.owner,    null,              null,              {da:'Ejer/Distributør', en: 'Owner/Distributor' } ));
            content.push( abbrAndName( this.model.options.id, null,              null,              {da:'Model',            en: 'Model'             } ));
            content.push( abbrAndName( this.options.abbr,     this.options.name, this.options.link, {da:'Område/Opsætning', en: 'Domain/Setting'    } ));


            content.push({
                type      : 'textarea',
                label     : {da: 'Opdatering og Opløsning', en:'Updating and Resolution'},
                text      : {
                    da: 'Prognosen opdateres hver ' + this.options.period +'. time<br>Den horisontale opløsning i prognosen er '+ this.options.resolution,
                    en: 'The forecast is updated every ' + this.options.period +'th hours<br>The horizontal resolution is '+ this.options.resolution
                },
                textClass : 'text-center',
                //lineBefore: true,
                center    : true
            });





            $container._bsAppendContent(content);
/*

Forventes opdateret Expected update
Ejer / distributør Owner / Distributor
Model
Område / Opsætning  Domain /Setting
Prognose frem til   Forecast until

*/


        }


    };

    /******************************************
    Initialize/ready
    *******************************************/
    $(function() {

    });
    //******************************************



}(jQuery, this.i18next, this.moment, this, document));