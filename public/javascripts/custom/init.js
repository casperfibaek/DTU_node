// Initialize the interface
function init() {
  // Query the URL for parameters
  var query = QueryString();

  // Check if the ID is correct and if the request has a NAME paramter.
  if ( query.ID && query.NAME ) {

    // Sets the headline equal to the passed URL NAME paramter
    jQuery( "#bygID > p" )
      .text( query.NAME );

    /*******************************************************************************
      BASIC LEAFLET OPTIONS
    *******************************************************************************/
    // create the map
    map = L.map( 'map', {
      center: [ 55.787016, 12.522536 ],
      zoom: 16,
      maxZoom: 21,
      minZoom: 13,
      zoomControl: true,
      doubleClickZoom: false,
      editable: true // enables leaflet.editable
    } );

    // GST Ortho 2016
    var GST_Ortho = L.tileLayer.wms( 'https://kortforsyningen.kms.dk/?servicename=orto_foraar', {
        login: 'qgisdk',
        password: 'qgisdk',
        version: '1.1.1',
        layers: 'orto_foraar',
        format: 'image/png',
        maxZoom: 21,
        maxNativeZoom: 18,
        attribution: '&copy; <a href="http://gst.dk">GeoDanmark</a>',
        edgeBufferTiles: 2 // extra edge tiles to buffer
      } )
      .addTo( map );

    // GST skaermkort 2016
    var GST_Skaerm = L.tileLayer.wms( 'https://kortforsyningen.kms.dk/?servicename=topo_skaermkort', {
      login: 'qgisdk',
      password: 'qgisdk',
      version: '1.1.1',
      layers: 'dtk_skaermkort_graa_3',
      format: 'image/png',
      maxZoom: 21,
      maxNativeZoom: 18,
      attribution: '&copy; <a href="http://gst.dk">GeoDanmark</a>',
      edgeBufferTiles: 2 // extra edge tiles to buffer
    } );

    var OSMbasemap = L.tileLayer( 'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors,' +
        '<a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>',
      maxZoom: 21,
      maxNativeZoom: 18,
      edgeBufferTiles: 2 // extra edge tiles to buffer
    } );

    // Add to layer control
    var basemaps = {
      "Luftfoto": GST_Ortho,
      "Skærmkort": GST_Skaerm,
      "Open Street Maps": OSMbasemap
    };

    var overlayMaps = {
      // ...
    };

    var mainControl = L.control.layers( basemaps, overlayMaps, {
        collapsed: false
      } )
      .addTo( map );

    /*******************************************************************************
        Snapping functionality
    *******************************************************************************/
    // initialize the snapHandler as a global
    snap = new L.Handler.MarkerSnap( map );
    // map global that specifies what layer is currently being edited
    map._editing = null;

    var snapMarker = L.marker( map.getCenter(), {
      icon: map.editTools.createVertexIcon( {
        className: 'leaflet-div-icon leaflet-drawing-icon'
      } ),
      opacity: 1,
      zIndexOffset: 1000
    } );

    snapMarker
      .on( 'snap', function ( e ) {
        snapMarker.addTo( map );
      } )
      .on( 'unsnap', function ( e ) {
        snapMarker.remove();
      } );

    var followMouse = function ( e ) {
      snapMarker.setLatLng( e.latlng );
    };

    snap.watchMarker( snapMarker );

    // custom functions to easier add remove guide layers
    // loop backwards through guide array and remove layers matching ID
    snap.removeGuide = function ( layer ) {
      for ( var i = snap._guides.length - 1; i >= 0; i-- ) {
        if ( snap._guides[ i ]._leaflet_id === layer._leaflet_id ) {
          snap._guides.splice( i, 1 );
        }
      }
    };
    // Add a guide that is a polygon and is not the one that is being edited
    snap.addGuide = function ( layer ) {
      if ( layer instanceof L.Path ) {
        if ( map._editing !== layer._leaflet_id ) {
          snap.addGuideLayer( layer );
        }
      }
    };

    // event listeners to add or stop snapping depending on visible layers.
    map
      .on( 'layeradd', function ( e ) {
        snap.addGuide(e.layer);
        updateLegend();
      } )
      .on( 'layerremove', function ( e ) {
        snap.removeGuide( e.layer );
        snapMarker.remove();
      } )
      .on( "editable:enable", function ( e ) {
        map._editing = e.layer._leaflet_id;
        map.off( 'layeradd' );
      } )
      .on( "editable:disable", function ( e ) {
        map._editing = null;
        map.on( 'layeradd', function ( e ) {
          snap.addGuide(e.layer);
        } );
      } )
      .on( 'editable:vertex:dragstart', function ( e ) {
        snap.watchMarker( e.vertex );
      } )
      .on( 'editable:vertex:dragend', function ( e ) {
        snap.unwatchMarker( e.vertex );
      } )
      .on( 'editable:drawing:start', function () {
        this.on( 'mousemove', followMouse );
      } )
      .on( 'editable:drawing:click', function ( e ) {
        var latlng = snapMarker.getLatLng();
        e.latlng.lat = latlng.lat;
        e.latlng.lng = latlng.lng;
      } )
      // This only fires when an original drawing is done.
      .on( 'editable:drawing:end', function ( e ) {
        this.off( 'mousemove', followMouse );
        snapMarker.remove();
        if ( e.layer._parts ) {
          if ( e.layer._parts.length > 0 ) {
            // function is from eventLayers.js

            console.log("fired end", e);
            var layer2create = e.layer.toGeoJSON();
            var selected = $(".lastSelected").attr("ref");

            if(selected === 'undefined'){
              layer2create.properties.Type = "Parkering";
            } else if (selected === "byggeri"){
              layer2create.properties.Type = "Midlertidig bygning";
            } else if (selected === "byggeplads"){
              layer2create.properties.Type = "Byggeplads";
            } else if (selected === "parkering"){
              layer2create.properties.Type = "Parkering";
            } else if (selected === "adgangsvej"){
              layer2create.properties.Type = "Midlertidig gangsti";
            }

            dbJSON( layer2create );
            map.removeLayer( e.layer );
            console.log("i fired", e);
            $( ".selected" )
              .removeClass( "selected" );
            updateLegend();
          }
        }
      } );

    /*******************************************************************************
        Get KortInfo layers and add WFS TODO: change standard style to match type
    *******************************************************************************/
    $.get( '/api/get/' + query.ID, function ( data ) {
      for ( var i = 0; i < data.length; i++ ) {

        // change the type to the more readable lookup type
        if ( data[ i ].properties.Type ) {
          // function is from styles_andlookups.js
          data[ i ].properties.Type = lookUp( data[ i ].properties.Type );
        }

        // add the layer with a standard style
        // function is from eventLayers.js
        var addLayer = eventJSON( data[ i ], true )
          .addTo( map );
      }
    } );

    // WFS layers: layername, displayname, style, editable
    // functions are from layerFunctions.js
    addWfsLayer( "ugis:T6832", "Byggepladser", false );
    addWfsLayer( "ugis:T6834", "Parkering", false );
    addWfsLayer( "ugis:T6831", "Adgangsveje", false );
    addWfsLayer( "ugis:T6833", "Ombyg og Renovering", false );
    addWfsLayer( "ugis:T7418", "Nybyggeri", false );
    addWMSlayer( "18454", "Streetfood" );

    /*******************************************************************************
        Add Buildings and lables (local file) TODO: get buildings from WFS
    *******************************************************************************/
    // Adds local dtu buildings layer
    var labels = L.layerGroup();

    // function is from eventLayers.js
    var stpByg = L.geoJSON( dtu_bygninger );
    stpByg.eachLayer(function(layer){
      layer.feature.properties.Type = "Bygninger";
    });

    var dtuByg = eventJSON( stpByg.toGeoJSON(), false );
    // Loop through buildings and create labels
    dtuByg.eachLayer( function ( layer ) {

      var properties = layer.feature.properties;
      var bygnr = properties.DTUbygnnr;
      var afsnit = properties.Afsnit;

      // Create string if building if afsnit is not empty
      var postStr = "Bygning " + bygnr;
      if ( afsnit !== null && afsnit !== 0 ) {
        postStr += ", " + afsnit;
      }

      // Create markers at the centroid of the building and attach toolTip
      if ( bygnr !== null ) {
        var marker = L.marker(
            layer
            .getBounds()
            .getCenter(), {
              opacity: 0
            }
          )
          .bindTooltip( postStr, {
            permanent: true,
            offset: [ 0, 25 ]
          } )
          .openTooltip();

        labels.addLayer( marker );
      }
    } );

    // add the layers to the custom layer list.
    // function is from layerFunctions.js
    add2LayerList( "Bygninger", dtuByg );
    add2LayerList( "Bygninger - Labels", labels );

    // LEGEND
    updateLegend();

    // Start loading the interface
    interface();

    /*******************************************************************************
      IF not valid ID is shown, don't load interface and display error message.
    *******************************************************************************/
  } else {
    jQuery( "body" )
      .empty()
      .html( "<p> Invalid URL parameters </p>" );
  }
}
