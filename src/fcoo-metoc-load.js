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