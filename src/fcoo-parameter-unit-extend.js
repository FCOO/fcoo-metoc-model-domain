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