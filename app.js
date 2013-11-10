function setCookie(c_name, value, exdays)
{
  console.log("Storing access token " + value);
  var exdate=new Date();
  exdate.setDate(exdate.getDate() + exdays);
  var c_value=escape(value) + ((exdays==null) ? "" : "; expires="+exdate.toUTCString());
  document.cookie=c_name + "=" + c_value;
}

function getCookie(c_name)
{
  var c_value = document.cookie;
  var c_start = c_value.indexOf(" " + c_name + "=");
  if (c_start == -1)
    {
    c_start = c_value.indexOf(c_name + "=");
    }
  if (c_start == -1)
    {
    c_value = null;
    }
  else
    {
    c_start = c_value.indexOf("=", c_start) + 1;
    var c_end = c_value.indexOf(";", c_start);
    if (c_end == -1)
    {
  c_end = c_value.length;
  }
  c_value = unescape(c_value.substring(c_start,c_end));
  }
  return c_value;
}

(function($){

  // Parse setup
  Parse.initialize("pl5Mrd7JuevIbDeog6COfDCrUI4UMKResND4uV9l", "SYG3E16QhUpmF3tFv5WLGYJirJbi5yXMCRZ6j00m");

  // SoundCloud setup
  SC.initialize({
    client_id: "20c747bd72eaa3c7d88dbc712ca696b0",
    redirect_uri: "https://dl.dropboxusercontent.com/u/986362/soundmap/callback.html",
    access_token: getCookie("SC_act"),
    scope: 'non-expiring'
  });  

  /*--------------------------------------
  *
  *    USER POSITION
  *
  --------------------------------------*/

  // User position model
  var UserPosition = Backbone.Model.extend({
    defaults: {
      lat: null,
      lng: null
    },
    getLatitude: function() {
      return this.get("lat");
    },
    getLongitude: function() {
      return this.get("lng");
    },
    setPosition: function(lat, lng) {
      this.set({ lat: lat, lng: lng });
    }
  });


  // View for displaying user position
  UserPositionView = Backbone.View.extend({
    initialize: function() {
      _.bindAll(this, 'render', 'update', 'initLocation', 'showTracksOnMap', 'renderTrack', 'clearMarkers', 'deactivateMarkers');

      this.listenTo(this.model, 'change', this.render);

      this.markers = [];

      // User location
      if (navigator.geolocation) {
        // Init
        navigator.geolocation.getCurrentPosition(this.initLocation);
        // Keep tracking user position 
        navigator.geolocation.watchPosition(this.update);
      }
    },
    render: function() {
      console.log("Rendering position view");
      this.$el.html("Position: " + this.model.getLatitude() + ", " + this.model.getLongitude());  

      // Update user location on map
      if (this.userMarker)
        this.userMarker.setPosition(new google.maps.LatLng(this.model.getLatitude(), this.model.getLongitude()));

      // Plot tracks
      if (this.model.getLatitude())
        this.showTracksOnMap();

      return this;
    },

    initLocation: function(position) {      
      google.maps.visualRefresh = true;

      var mapOptions = {
        center: new google.maps.LatLng(position.coords.latitude, position.coords.longitude),
        zoom: 15,
        maxZoom: 17,
        minZoom: 11
        //mapTypeId: google.maps.MapTypeId.ROADMAP
      } ;
      this.map = new google.maps.Map(document.getElementById("map-canvas"), mapOptions);

      // Current user location
      this.userMarker = new google.maps.Marker({
        position: new google.maps.LatLng(position.coords.latitude, position.coords.longitude),
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 6
        },
      });
      this.userMarker.setMap(this.map);

      this.model.setPosition(position.coords.latitude, position.coords.longitude);

      var self = this;
      google.maps.event.addListener(this.map, 'bounds_changed', function() {
         self.render();
      });
    },

    update: function(position) {
      console.log("Updating position in view");
      this.model.setPosition(position.coords.latitude, position.coords.longitude);
    },

    showTracksOnMap: function() {
      this.clearMarkers();

      var Sound = Parse.Object.extend("Sound");
      var userPosition = new Parse.GeoPoint({ latitude: this.model.getLatitude(), longitude: this.model.getLongitude() });
      var self = this;  

      // Playable tracks
      var query1 = new Parse.Query(Sound);
      var distance = 0.1; // max distance in km
      query1.withinKilometers("position", userPosition, distance);
      query1.find().then(function(tracks) {  
        for (var i = 0; i < tracks.length; i++) {
          self.renderTrack(tracks[i], true);
        }
      }, function(error) {
        console.log(error);
      });

      // All tracks within maps bound, excluding playable tracks
      var query2 = new Parse.Query(Sound);
      query2.doesNotMatchKeyInQuery("trackId", "trackId", query1);
      query2.near("position", userPosition);
      /*
      var bounds = this.map.getBounds();
      var southwest = new Parse.GeoPoint(bounds.getSouthWest().lat(), bounds.getSouthWest().lng());
      var northeast = new Parse.GeoPoint(bounds.getNorthEast().lat(), bounds.getNorthEast().lat());
      query2.withinGeoBox("position", southwest, northeast);
      */
      query2.limit(100);
      query2.find().then(function(tracks) {
        for (var i = 0; i < tracks.length; i++) {
          self.renderTrack(tracks[i], false);
        }
      }, function(error) {
        console.log(error);
      });

    },

    // Clears and deletes all markers from map
    clearMarkers: function() {
      for (var i = 0; i < this.markers.length; i++) {
        this.markers[i][1].setMap(null);
      }
      this.markers = [];
    },

    setActiveMarker: function(trackId) {
      for (var i = 0; i < this.markers.length; i++) {
        var id = this.markers[i][0];
        if (id == trackId)
          this.markers[i][1].setIcon("http://maps.google.com/mapfiles/ms/icons/green-dot.png");
      }
    },

    deactivateMarkers: function(trackId) {
      for (var i = 0; i < this.markers.length; i++) {
        if (this.markers[i][1].getIcon() == "http://maps.google.com/mapfiles/ms/icons/green-dot.png")
          this.markers[i][1].setIcon("http://maps.google.com/mapfiles/ms/icons/yellow-dot.png");
      }
    },

    // Renders a single track
    renderTrack: function(trackObj, playable) {
      var trackId = trackObj.get("trackId");
      // Create marker 
      var position = trackObj.get("position");
      var trackPos = new google.maps.LatLng(position.latitude, position.longitude);
      var marker = new google.maps.Marker({
        position: trackPos,
        title:""
      });
      marker.setMap(this.map);
      this.markers.push([trackId, marker]);

      if (playable)
        marker.setIcon("http://maps.google.com/mapfiles/ms/icons/yellow-dot.png");
      else
        marker.setIcon("http://maps.google.com/mapfiles/ms/icons/red-dot.png");

      // Get other track info from SC
      SC.get('/tracks/' + trackId, function(track) { 
        marker.setTitle(track.user.username + ": " + track.title);           
      }); 
    }

  });

  /*--------------------------------------
  *
  *    APP VIEW
  *
  --------------------------------------*/

  var AppView = Backbone.View.extend({
    el: $("#player-container"),

    events: {
      'click button#play-by-position': 'startStream',
      'click button#pause': 'pause'
    },

    initialize: function(){
       _.bindAll(this, 'render', 'playByPosition', 'startStream', 'pause'); 

      // User position subview
      this.userPositionView = new UserPositionView({ model: new UserPosition() });   

      this.render();

      // Blank dummy sound, fixingaudio loading issue on mobile browsers
      SC.stream("/tracks/118451467", {
          useHTML5Audio: true,
          preferFlash: false
        }, function(sound){  
          this.track = sound; 
      });
      
    },

    render: function(){
      this.$el.append(this.userPositionView.render().el);

      this.$el.append("<button id='play-by-position'>play by location</button>");
      this.$el.append("<button id='pause'>pause</button>");

      return this;
    },

    currentUserPosition: function() {
      return [this.userPositionView.model.getLatitude(), this.userPositionView.model.getLongitude()];
    },

    playByPosition: function() {
      // Get current location
      var p = this.currentUserPosition();
      var userPosition = new Parse.GeoPoint({
        latitude: p[0], 
        longitude: p[1]
      });

      var Sound = Parse.Object.extend("Sound");
      var query = new Parse.Query(Sound);
      //query.near("position", userPosition);
      var distance = 0.1; // max distance in km
      query.withinKilometers("position", userPosition, distance);
      console.log(distance);
      var self = this;

      query.find().then(function(tracks) {
        // Play nearest track
          var trackId = tracks[0].get("trackId");
          console.log("Fetched track from Parse " + trackId);

          SC.stream(trackId, {
            useHTML5Audio: true,
            preferFlash: false
          }, function(sound){
            sound.play({onfinish: self.playByPosition});
            self.track = sound;
            self.userPositionView.setActiveMarker(trackId);

          });
      }, function(error) {
        console.log(error);
       
      }); 
    },

    startStream: function() {
      track.play({onfinish: this.playByPosition});
    },

    pause: function() {
      this.track.pause();
      this.userPositionView.deactivateMarkers();
    }

  });

  var appView = new AppView();


})(jQuery);

