/**********************************************************************
 * Copyright 2022 Paul Reeve <preeve@pdjr.eu>
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you
 * may not use this file except in compliance with the License. You may
 * obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
 * implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

const Log = require("./lib/signalk-liblog/Log.js");
const Delta = require("./lib/signalk-libdelta/Delta.js");

const PLUGIN_ID = "pgn130316";
const PLUGIN_NAME = "pdjr-skplugin-pgn130316";
const PLUGIN_DESCRIPTION = "Map PGN 130316 into Signal K";
const PLUGIN_SCHEMA = {
  "title": "Configuration for pdjr-skplugin-pgn130316",
  "type": "object",
  "required": [ "temperatureMapping" ],
  "properties": {
    "temperatureMapping": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "source" : {
            "type": "string"
          },
          "path": {
            "type": "string"
          },
          "name": {
            "type": "string"
          }
        },
        "required": [ "source", "path" ]
      }
    }
  },
  "required": [ "temperatureMapping" ],
  "default": {
    "temperatureMapping": [
      { "source": 0, "path": "environment.water.${instance}", "name": "Sea Temperature" },
      { "source": 1, "path": "environment.outside.${instance}", "name": "Outside Temperature" },
      { "source": 2, "path": "environment.inside.${instance}", "name": "Inside Temperature" },
      { "source": 3, "path": "environment.inside.engineRoom.${instance}", "name": "Engine Room Temperature" },
      { "source": 4, "path": "environment.inside.mainCabin.${instance}", "name": "Main Cabin Temperature" },
      { "source": 5, "path": "tanks.liveWell.${instance}", "name": "Live Well Temperature" },
      { "source": 6, "path": "tanks.baitWell.${instance}", "name": "Bait Well Temperature" },
      { "source": 7, "path": "environment.inside.refrigerator.${instance}", "name": "Refrigeration Temperature" },
      { "source": 7, "path": "environment.inside.refrigerator.${instance}", "name": "Refridgeration Temperature" },
      { "source": 8, "path": "environment.inside.heating.${instance}", "name": "Heating System Temperature" },
      { "source": 9, "path": "environment.outside.dewPoint.${instance}", "name": "Dew Point Temperature" },
      { "source": 10, "path": "environment.outside.apparentWindChill.${instance}", "name": "Apparent Wind Chill Temperature" },
      { "source": 11, "path": "environment.outside.theoreticalWindChill.${instance}", "name": "Theoretical Wind Chill Temperature" },
      { "source": 12, "path": "environment.outside.heatIndex.${instance}", "name": "Heat Index Temperature" },
      { "source": 13, "path": "environment.inside.freezer.${instance}", "name": "Freezer Temperature" },
      { "source": 14, "path": "propulsion.exhaust.${instance}", "name": "Exhaust Gas Temperature" },
      { "source": "*", "path": "sensors.temperature.${source}.${instance}" }
    ]
  }
};
const PLUGIN_UISCHEMA = {};

module.exports = function(app) {
  var plugin = {};

  plugin.id = PLUGIN_ID;
  plugin.name = PLUGIN_NAME;
  plugin.description = PLUGIN_DESCRIPTION;
  plugin.schema = PLUGIN_SCHEMA;
  plugin.uiSchema = PLUGIN_UISCHEMA;

  const log = new Log(plugin.id, { ncallback: app.setPluginStatus, ecallback: app.setPluginError });
  const delta = new Delta(app, plugin.id);  

  plugin.start = function(options) {
  
    if (Object.keys(options).length == 0) {
      options = plugin.schema.default;
      log.N("using default configuration", false);
    }

    if ((options.temperatureMapping) && (Array.isArray(options.temperatureMapping)) && (options.temperatureMapping.length > 0)) {

      log.N("started: processing PGN 130316 messages");

      var nodes = new Set();

      app.emitPropertyValue('pgn-to-signalk', {
        130316: [
          {
            node: function(n2k) {
              var node = undefined;
              var map = getMap(options.temperatureMapping, '' + n2k.fields['Source'], n2k.fields['Instance']);

              if (map) {
                node = map.path + '.' + 'temperature';
                if (!nodes.has(node)) {
                  nodes.add(node);
                  delta.addMeta(node, {
                    "description": "Temperature, Extended Range" + (map.name)?(" (" + map.name + ")"):"",
                    "instance": map.instance,
                    "source": map.source,
                    "units": "K"
                  }).commit().clear();
                }
              }
              return(node);
            },
            value: function(n2k) {
              return(n2k.fields['Temperature']);
            }
          },
          {
            node: function(n2k) {
              var node = undefined;
              var map = getMap(options.temperatureMapping, '' + n2k.fields['Source'], n2k.fields['Instance']);

              if (map) {
                node = map.path + '.' + 'setTemperature';
                if (!nodes.has(node)) {
                  nodes.add(node);
                  delta.addMeta(node, {
                    "description": "Temperature, Extended Range" + (map.name)?(" (" + map.name + ")"):"",
                    "instance": map.instance,
                    "source": map.source,
                    "units": "K"
                  }).commit().clear();
                }
              }
              return(node);
            },
            value: function(n2k) {
              return(n2k.fields['Set Temperature']);
            }
          }
        ]
      });
    } else {
      log.E("stopped: bad or missing configuration");
    }
  }

  plugin.stop = function() {
  }

  /**
   * Return a Signal K path for storage of a temperature value.
   * 
   * This is trickier than it needs to be because canboatjs encodes
   * NMEA temperature source codes in the range 0 through 14 into
   * their defined names, but leaves other source codes untouched.
   * 
   * @param {*} mapping - array of { source, path, name } values. 
   * @param {*} source - the Source property from canboatjs.
   * @param {*} instance - the Instance property from canboatjs.
   * @returns 
   */
  function getMap(mapping, source, instance) {
    var retval = undefined;
    for (var i = 0; i < mapping.length; i++) {
      if ((mapping[i].source == "*") || (mapping[i].source == source) || ((mapping[i].name) && (mapping[i].name == source))) {
        retval = {
          source: mapping[i].source,
          path: ((mapping[i].path).replace('${source}', mapping[i].source)).replace('${instance}', instance).replace('${name}', mapping[i].name),
          instance: instance,
          name: mapping[i].name
        };
        break;
      }
    }
    return(retval);
  }
  
  return(plugin);
}
