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