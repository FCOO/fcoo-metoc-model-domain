/****************************************************************************
fcoo-metoc-parameter.js

See http://www.nco.ncep.noaa.gov/pmb/docs/on388/table2.html for more parameter

****************************************************************************/

(function ($, i18next, moment, window/*, document, undefined*/) {
    "use strict";

    //Create fcoo-namespace
    var ns = window.fcoo = window.fcoo || {},
        nsUnit = ns.unit = ns.unit || {},
        nsParameter = ns.parameter = ns.parameter || {},
        nsModel = ns.model = ns.model || {};

    /****************************************************************************
    UNIT
    Extended namespace fcoo.unit from fcoo/fcoo-unit with list of all units and
    general conversion-methods
    Read all units from file with format =
    []{
        WMO_unit: STRING.
        CF_unit : STRING,
        da      : STRING,
        en      : STRING,
        name    : STRING,
        SI_offset: NUMBER, //default = 0
        SI_factor: NUMBER, //default = 1
    }
    only one of en, da, name are needed

    ****************************************************************************/
    function Unit(options){
        this.options = $.extend(true, {
            SI_offset: 0,
            SI_factor: 1
        }, options);

        this.name = {
            da: options.da || options.en || options.name,
            en: options.en || options.da || options.name
        };
    }
    nsUnit.Unit = Unit;
    nsUnit.Unit.prototype = {
    };

    //Create list and methods direct in namespace
    nsUnit.list = [];
    nsUnit.getUnit = function(id){
        var result = null;
        $.each(nsUnit.list, function(index, unit){
            if ((unit.options.WMO_unit == id) || (unit.options.CF_unit == id)){
                result = unit;
                return false;
            }
        });
        return result;
    };

    nsUnit.convert = function(value, fromUnitId, toUnitId){
        var fromUnit = nsUnit.getUnit(fromUnitId),
            toUnit   = nsUnit.getUnit(toUnitId);
        if (fromUnit && toUnit){
            var SI_value = fromUnit.options.SI_offset + fromUnit.options.SI_factor * value;
            return (SI_value - toUnit.options.SI_offset) / toUnit.options.SI_factor;
        }
        else
            return null;
    };


    //Allways load units
    ns.promiseList.append({
        fileName: {subDir: 'parameter-unit', fileName: 'unit.json'},
        resolve : function(data){
            $.each(data, function(index, options){
                nsUnit.list.push(new nsUnit.Unit(options));
            });
        }
    });

    /****************************************************************************
    PARAMETER
    If fcoo.model.options.includeModel is set to true all models and domain-groups
    are loaded and each parameter is linked to a domain-group via setup in the parameter_domainGroup list
        {
            "WMO_id"  : "031",
            "group"   : "WIND",
            "WMO_name": "Wind direction (from which blowing)",
            "WMO_unit": "deg true",
            "WMO_abbr": "WDIR",
            "CF_SN"   : "wind_from_direction",
            "da"      : "Vindretning",
            "en"      : "Wind direction"
        },

    ****************************************************************************/
    nsParameter.options = {
    };


    nsParameter.list = [];
    nsParameter.getParameter = function(id){
        var result = null;
        $.each(nsParameter.list, function(index, parameter){
            if ((parameter.options.WMO_id == id) ||
                (parameter.options.WMO_abbr == id) ||
                (parameter.options.CF_SN == id)){
                result = parameter;
                return false;
            }
        });
        return result;
    };

    /****************************************************************************
    Parameter
    ****************************************************************************/
    function Parameter(options) {
        this.options = $.extend(true, {}, nsParameter.options, options);
        this.name = {
            da: options.da || options.en || options.name,
            en: options.en || options.da || options.name
        };
        /*
        Create translation of paramter-names with Namespace parameter and WMO-abbr and/or CF Standard Name as key
        E.g.
        parameter:wind = {da:"vindhastighed", en:"wind speed"}
        parameter:wdir = {da:"vindretning", en:"wind direction"}
        */
        if (this.name.da){
            if (this.options.WMO_abbr)
                i18next.addPhrase( 'parameter', this.options.WMO_abbr, this.name );
            if (this.options.CF_SN)
                i18next.addPhrase( 'parameter', this.options.CF_SN, this.name);
        }
        else
            this.name = this.options.WMO_name;

        //this.wmoUnit = the standard unit given by WMO
        this.wmoUnit = nsUnit.getUnit(this.options.WMO_unit);

    }
    nsModel.Parameter = Parameter;
    nsModel.Parameter.prototype = {
        _getDomainGroup: function( data ){
            //Find the related domain-group from the relations in data
            var this_id = this.options.CF_SN || this.options.WMO_abbr,
                this_group = this.options.group,
                this_domainGroupId = null;

            $.each(data, function(domainGroupId, domainGroupParameters){
                if (domainGroupParameters.id && (domainGroupParameters.id.indexOf(this_id) > -1))
                    this_domainGroupId = domainGroupId;
                if (domainGroupParameters.group && (domainGroupParameters.group.indexOf(this_group) > -1))
                    this_domainGroupId = this_domainGroupId || domainGroupId;
            });

            this.domainGroup = nsModel.domainGroupList.groups[this_domainGroupId] || null;
        },

        domainGroupAsModal: function(center, zoom){
            if (this.domainGroup)
                this.domainGroup.asModal(this.name, center, zoom);
        }

    };

    //Allways load parameters
    ns.promiseList.append({
        fileName: {subDir: 'parameter-unit', fileName: 'parameter.json'},
        resolve : function(data){
            $.each(data, function(index, options){
                nsParameter.list.push(new Parameter(options));
            });
        }
    });



    /*
    Namespace parameter
    Physical parameter. Using XXX codes for parameter. See http://www.nco.ncep.noaa.gov/pmb/docs/on388/table2.html
    E.g.
        parameter:wind = {da:"vindhastighed", en:"wind speed"}
        parameter:wdir = {da:"vindretning", en:"wind direction"}
    */
/* TODO

    en: {
          'Significant wave height of combined wind waves and swell': 'Wave height',
          'degC': '&deg;C',
          'Temp.': 'Temperature'
    },
    da: {
          'Wave height': 'Bølgehøjde',
          'Mean wave period': 'Bølgeperiode',
          'Vel.': 'Strømhastighed',
          'Current speed': 'Strømhastighed',
          'Current': 'Strømhastighed',
          'Elevation': 'Vandstand',
          'Temperature': 'Temperatur',
          'Temp.': 'Temperatur',
          'Salinity': 'Salinitet',
          'Sea surface temperature': 'Temperatur',
          'Sea surface salinity': 'Salinitet',
          'Wind speed': 'Vindhastighed',
          'Wind': 'Vindhastighed',
          'Air temperature (2m)': '2 meter temperatur',
          'Sea ice concentration': 'Haviskoncentration',
          'Sea ice thickness': 'Havistykkelse',
          'Sea ice drift speed': 'Havisdrifthastighed',
          'Visibility': 'Sigtbarhed',
          'Total precipitation flux': 'Nedbør',
          '2 metre temperature': '2 meter temperatur',
          'Total cloud cover': 'Skydække',
          'Significant wave height of combined wind waves and swell': 'Bølgehøjde',
          'mm/hour': 'mm/time',
          'degC': '&deg;C',
          'knots': 'knob',
          'fraction': 'fraktion',
          'meters': 'meter'
    }
*/
/*
    Namespace unit
    Physical units.
    E.g. unit:metre = {da:"meter", en:"metre"}
*/



}(jQuery, this.i18next, this.moment, this, document));