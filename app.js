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

  var Track = Backbone.Model.extend({
    defaults: function() {
      return {
        id: null,
        position: 0
      };
    },
  });

  var TrackCollection = Backbone.Collection.extend({
    model: Track
  });

  /*--------------------------------------
  *
  *    APP VIEW
  *
  --------------------------------------*/

  var AppView = Backbone.View.extend({
    el: $("#app-container"),

    events: {
      'click button#start-trail': 'startTrail',
      'click button#pause': 'pause',
      'click button#resume': 'resume'
    },

    //------------------------------
    //
    // Init
    //
    //------------------------------
    initialize: function(){
       _.bindAll(this, 
          'initMap', 'onPositionChange', 
          'getTracksForPosition', 
          'addTrackAvailable', 'resetTracksAvailable',
          'addTrackNearby', 'resetTracksNearby',
          'addTrackToMap',
          'startTrail', 'playByPosition', 'pause', 'showPlayer'); 

      // Update tracks when user position changes
      this.listenTo(this.model, 'change', this.getTracksForPosition);  

      // Track collections
      this.tracksNearby = new TrackCollection();
      this.tracksNearby.on('add', this.addTrackNearby);
      this.tracksNearby.on('reset', this.resetTracksNearby);

      this.tracksAvailable = new TrackCollection();
      this.tracksAvailable.on('add', this.addTrackAvailable);
      this.tracksAvailable.on('reset', this.resetTracksAvailable);

       // Map variables
      this.map = $("#map-canvas");
      this.tracksAvailableMarkers = [];
      this.tracksNearbyMarkers = [];

      // User location
      if (navigator.geolocation) {
        // Init
        navigator.geolocation.getCurrentPosition(this.initMap);
        // Keep tracking user position 
        navigator.geolocation.watchPosition(this.onPositionChange);
      }

      // Playback
      this.streamingTrack = null;  // active track being played
      this.trackId = null;  // id of active track
 
      // Blank dummy sound, fixingaudio loading issue on mobile browsers
      SC.stream("/tracks/118451467", {
          useHTML5Audio: true,
          preferFlash: false
        }, function(sound){  
          this.streamingTrack = sound;
      });
    },

    initMap: function(position) {    
      this.model.setPosition(position.coords.latitude, position.coords.longitude);  
      // Init map
      google.maps.visualRefresh = true;
      var mapOptions = {
        center: new google.maps.LatLng(position.coords.latitude, position.coords.longitude),
        zoom: 15,
        maxZoom: 17,
        minZoom: 11
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

      // Redraw tracks when map bounds change
      google.maps.event.addListener(this.map, 'bounds_changed', this.getTracksForPosition);
    },

    onPositionChange: function(position) {
      console.log("Updating model position");
      this.model.setPosition(position.coords.latitude, position.coords.longitude);
    },

    //------------------------------
    //
    // Track collections
    //
    //------------------------------
    getTracksForPosition: function() {
      console.log("Update tracks for user position");

      var Sound = Parse.Object.extend("Sound");
      var userPosition = new Parse.GeoPoint({ latitude: this.model.getLatitude(), longitude: this.model.getLongitude() });
      var self = this;  

      // Reset collections
      this.tracksAvailable.reset();
      this.tracksNearby.reset();

      // Available tracks for current location
      var query1 = new Parse.Query(Sound);
      var distance = 0.1; // max distance in km
      query1.withinKilometers("position", userPosition, distance);
      query1.find().then(function(tracks) {  

        for (var i = 0; i < tracks.length; i++) {
          var t = new Track({
              id: tracks[i].get("trackId"),
              position: tracks[i].get("position")
          });
          self.tracksAvailable.add(t); // Add to collection
        }
      }, function(error) {
        console.log(error);
      });
      
      // All tracks within maps bound, excluding playable tracks
      var query2 = new Parse.Query(Sound);
      query2.doesNotMatchKeyInQuery("trackId", "trackId", query1);
      query2.near("position", userPosition);
      query2.limit(100);
      query2.find().then(function(tracks) {
        for (var i = 0; i < tracks.length; i++) {
          var t = new Track({
              id: tracks[i].get("trackId"),
              position: tracks[i].get("position")
          });
          self.tracksNearby.add(t); // Add to collection
        }
      }, function(error) {
          console.log(error);
      });
    },

    addTrackAvailable: function(track) {
      var marker = this.addTrackToMap(track, true);
      this.tracksAvailableMarkers.push([track.id, marker]);
    },

    resetTracksAvailable: function() {
      for (var i = 0; i < this.tracksAvailableMarkers.length; i++) 
        this.tracksAvailableMarkers[i][1].setMap(null);
      this.tracksAvailableMarkers = [];
    },

    addTrackNearby: function(track) {
      var marker = this.addTrackToMap(track, false);
      this.tracksNearbyMarkers.push([track.id, marker]);
      // Highlight active track
      this.setActiveMarker(this.trackId);
    },

    resetTracksNearby: function() {
      for (var i = 0; i < this.tracksNearbyMarkers.length; i++) 
        this.tracksNearbyMarkers[i][1].setMap(null);
      this.tracksNearbyMarkers = [];
    },

    //------------------------------
    //
    // Show tracks on map
    //
    //------------------------------
    addTrackToMap: function(trackObj, available) {
      var trackId = trackObj.get("trackId");
      // Create marker 
      var position = trackObj.get("position");
      var trackPos = new google.maps.LatLng(position.latitude, position.longitude);
      var marker = new google.maps.Marker({
        position: trackPos,
        title:""
      });
      marker.setMap(this.map);

      if (available)
        marker.setIcon("http://maps.google.com/mapfiles/ms/icons/yellow-dot.png");
      else
        marker.setIcon("http://maps.google.com/mapfiles/ms/icons/red-dot.png");

      // Get other track info from SC
      SC.get('/tracks/' + trackId, function(track) { 
        marker.setTitle(track.user.username + ": " + track.title);           
      }); 

      return marker;
    },

    setActiveMarker: function(trackId) {
      console.log("active " + trackId);
      if (trackId != null) {
        for (var i = 0; i < this.tracksAvailableMarkers.length; i++) {
          var id = this.tracksAvailableMarkers[i][0];
          if (id == trackId)
            this.tracksAvailableMarkers[i][1].setIcon("http://maps.google.com/mapfiles/ms/icons/green-dot.png");
        }
      }
    },

    deactivateMarkers: function(trackId) {
      for (var i = 0; i < this.tracksAvailableMarkers.length; i++) {
        if (this.tracksAvailableMarkers[i][1].getIcon() == "http://maps.google.com/mapfiles/ms/icons/green-dot.png")
          this.tracksAvailableMarkers[i][1].setIcon("http://maps.google.com/mapfiles/ms/icons/yellow-dot.png");
      }
    },

    //------------------------------
    //
    // Playback
    //
    //------------------------------  
    startTrail: function() {
      if (streamingTrack)
        streamingTrack.play({onfinish: this.playByPosition});
    },

    playByPosition: function() {
      this.trackId = null;

      // Get current location
      var userPosition = new Parse.GeoPoint({
        latitude: this.model.getLatitude(), 
        longitude: this.model.getLongitude()
      });

      var Sound = Parse.Object.extend("Sound");
      var query = new Parse.Query(Sound);
      //query.near("position", userPosition);
      var distance = 0.1; // max distance in km
      query.withinKilometers("position", userPosition, distance);
      var self = this;

      query.find().then(function(tracks) {
        // Play nearest track
        if (tracks.length == 0) 
          self.showNoTracksAvailable();
        else{
          console.log("Fetched track from Parse " + trackId);
          var trackId = tracks[0].get("trackId");
          self.trackId = trackId;

          SC.stream(trackId, {
            useHTML5Audio: true,
            preferFlash: false
          }, function(sound){
            sound.play({onfinish: self.playByPosition});
            self.streamingTrack = sound;
            self.setActiveMarker(trackId);
            // Show track info and controls
            self.showPlayer(trackId);
          });
        }
      }, function(error) {
        console.log(error);
       
      }); 
    },

    // Show track info and controls
    showPlayer: function(trackId) {
      this.$el.find("#start").hide();
      var self = this;
      SC.get('/tracks/' + trackId, function(track) { 
        self.$el.find("#track-info").html("Now playing: " + track.user.username + ", " + track.title);
        self.$el.find("#player-container").show();          
      }); 
    },

    pause: function() {
      this.streamingTrack.pause();
      this.deactivateMarkers();
    },

    resume: function() {
      this.streamingTrack.resume();
      this.setActiveMarker(this.trackId);
    },

    showNoTracksAvailable: function(trackId) {
      this.$el.find("#player-container").hide();
      this.$el.find("#track-info").html("");
      this.$el.find("#status").html("Nothing nearby. Try going closer to a sound.");
      this.$el.find("#start").show();
    },

  });

  var appView = new AppView({ model: new UserPosition() });


})(jQuery);

