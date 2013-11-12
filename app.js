

(function($){

  // Parse setup
  Parse.initialize("pl5Mrd7JuevIbDeog6COfDCrUI4UMKResND4uV9l", "SYG3E16QhUpmF3tFv5WLGYJirJbi5yXMCRZ6j00m");

  // SoundCloud setup
  SC.initialize({
    client_id: "20c747bd72eaa3c7d88dbc712ca696b0",
    redirect_uri: "https://dl.dropboxusercontent.com/u/986362/soundmap/callback.html",
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
        position: 0  // Parse GeoPoint
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
      'click #start-trail': 'startTrail',
      'click #pausestream': 'pauseStream',
      'click #resumestream': 'resumeStream'
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
          'startTrail', 'playByPosition', 'pauseStream', 'resumeStream', 'showPlayer'); 

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

      this.distance = 0.05;

      // User location
      if (navigator.geolocation) {
        // Init
        navigator.geolocation.getCurrentPosition(this.initMap);
        // Keep tracking user position 
        navigator.geolocation.watchPosition(this.onPositionChange);
      }
       
      /*
      var self = this;
      window.setTimeout(function() {
        // lautsizer 52.496504, 13.427037
        // manteufel 52.494934,13.432402

        self.model.setPosition(52.496504, 13.427037); 
        self.userMarker.setPosition(new google.maps.LatLng(52.496504, 13.427037));
        console.log("Location " + self.model.getLatitude() + ", " + self.model.getLongitude());
      }, 9400);

      window.setTimeout(function() {
        self.model.setPosition(52.494934,13.432402); 
        self.userMarker.setPosition(new google.maps.LatLng(52.494934,13.432402));
        console.log("Location " + self.model.getLatitude() + ", " + self.model.getLongitude());
      }, 14000);
      */

      // Update tracks when user position changes
      this.listenTo(this.model, 'change', this.getTracksForPosition);  

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
        minZoom: 11,
        streetViewControl: false,
        mapTypeControl: false,
        zoomControlOptions: {
        position: google.maps.ControlPosition.LEFT_CENTER
        }
      } ;
      this.map = new google.maps.Map(document.getElementById("map-canvas"), mapOptions);

      // Current user location
      this.userMarker = new google.maps.Marker({
        position: new google.maps.LatLng(position.coords.latitude, position.coords.longitude),
        icon: "assets/userposition.svg",
        zIndex: 100
      });
      this.userMarker.setMap(this.map);

      // Get all tracks
      this.getTracksForPosition();

      // Redraw tracks when map bounds change
      //google.maps.event.addListener(this.map, 'bounds_changed', this.getTracksForPosition);
    },

    onPositionChange: function(position) {
      console.log("Updating model position");
      this.model.setPosition(position.coords.latitude, position.coords.longitude);

      this.userMarker.setPosition(new google.maps.LatLng(position.coords.latitude, position.coords.longitude));
    },

    //------------------------------
    //
    // Track collections
    //
    //------------------------------
    getTracksForPosition: function() {
      console.log("Update tracks for user position");

      // No need to fetch data if track is still playing
      if (this.streamingTrack != null && this.streamingTrack.playState == 1) {
        return;
      }

      var Sound = Parse.Object.extend("Sound");
      var userPosition = new Parse.GeoPoint({ latitude: this.model.getLatitude(), longitude: this.model.getLongitude() });
      var self = this;  

      // Reset collections
      this.tracksAvailable.reset();
      this.tracksNearby.reset();

      // Available tracks for current location
      var query1 = new Parse.Query(Sound);
      query1.withinKilometers("position", userPosition, this.distance);
      query1.find().then(function(tracks) {  

        if (tracks.length == 0) {
          if (self.$el.find("#loading").css("display") == "block")
            self.showNoTracksAvailable();
          if (self.streamingTrack != null && self.streamingTrack.paused)
            self.showNoTracksAvailable();
          if (self.streamingTrack == null)
            self.showNoTracksAvailable();
        }
        else if (tracks.length > 0) {
          console.log("Available tracks found. Current stream " + self.streamingTrack);
          if (self.$el.find("#loading").css("display") == "block")
            self.showPlaySound();
          if (self.streamingTrack == null)
            self.showPlaySound();
        }


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
      query2.limit(50);
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

    addTrackAvailable: function(trackObj) {
      var self = this;
      SC.get('/tracks/' + trackObj.get("id"), function(track) { 
        var title = track.user.username + ": " + track.title;
        if (track.artwork_url)
          var artwork = track.artwork_url;
        else
          var artwork = track.user.avatar_url;
        //console.log(trackObj.get("id") + ", " + title);

        var marker = self.addTrackToMap(trackObj.get("id"), trackObj.get("position"), artwork, title, true); 
        self.tracksAvailableMarkers.push([trackObj.id, marker]);         
      });  
    },

    resetTracksAvailable: function() {
      for (var i = 0; i < this.tracksAvailableMarkers.length; i++) 
        this.tracksAvailableMarkers[i][1].setMap(null);
      this.tracksAvailableMarkers = [];
    },

    addTrackNearby: function(trackObj) {
      var self = this;
      SC.get('/tracks/' + trackObj.get("id"), function(track) { 
        var title = track.user.username + ": " + track.title;
        if (track.artwork_url)
          var artwork = track.artwork_url;
        else
          var artwork = track.user.avatar_url;
        //console.log(trackObj.get("id") + ", " + title);

        var marker = self.addTrackToMap(trackObj.get("id"), trackObj.get("position"), artwork, title, true); 
        self.tracksAvailableMarkers.push([trackObj.id, marker]);         
      });  
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
    addTrackToMap: function(trackId, position, artworkUrl, title, available) {
        var iconsize = 30;

      var image = {
        url: artworkUrl,
        size: new google.maps.Size(iconsize, iconsize),
        origin: new google.maps.Point(0,0),
        anchor: new google.maps.Point(iconsize/2, iconsize),
        scaledSize: new google.maps.Size(iconsize, iconsize)
      };
      var shape = {
          coord: [1, 1, 1, iconsize, iconsize, iconsize, iconsize, 1],
          type: 'poly'
      };

      // Create marker 
      var trackPos = new google.maps.LatLng(position.latitude, position.longitude);
      var marker = new google.maps.Marker({
        position: trackPos,
        icon: image,
        shape: shape,
        title: title
      });
      marker.setMap(this.map);

      return marker;
    },

    setActiveMarker: function(trackId) {
      //if (trackId != null) {
        //for (var i = 0; i < this.tracksAvailableMarkers.length; i++) {
          //var id = this.tracksAvailableMarkers[i][0];
          //if (id == trackId)
          //this.tracksAvailableMarkers[i][1].setIcon("http://maps.google.com/mapfiles/ms/icons/green-dot.png");
        //}
      //}
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
      if (streamingTrack) {
        streamingTrack.play({onfinish: this.playByPosition});
      }
    },

    playByPosition: function() {
      this.trackId = null;

      // Get current location
      var userPosition = new Parse.GeoPoint({
        latitude: this.model.getLatitude(), 
        longitude: this.model.getLongitude()
      });

      var self = this;

      var Sound = Parse.Object.extend("Sound");
      var query = new Parse.Query(Sound);
      query.withinKilometers("position", userPosition, this.distance);
      query.find().then(function(tracks) {
        // No tracks found
        if (tracks.length == 0) {
          self.streamingTrack = null;
          self.showNoTracksAvailable();
        }
        // Play nearest track
        else {
          var trackId = tracks[0].get("trackId");
          self.trackId = trackId;
          console.log("Fetched track from Parse " + trackId);

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
        if (track.artwork_url)
          var artwork = track.artwork_url;
        else
          var artwork = track.user.avatar_url;
        self.$el.find("#player-container").css("background-image", "url(" + artwork + ")");
        self.$el.find("#trackinfo").html(track.user.username + "<br>" + track.title);
        self.$el.find("#trackinfo").attr("href", track.permalink_url);
        self.$el.find("#player-container").show();          
      }); 
    },

    pauseStream: function() {
      this.trackId = null;
      this.streamingTrack.pause();
      this.deactivateMarkers();
      this.$el.find("#pausestream").hide(); 
      this.$el.find("#resumestream").show(); 
    },

    resumeStream: function() {
      this.streamingTrack.resume();
      this.setActiveMarker(this.trackId);
      this.$el.find("#pausestream").show(); 
      this.$el.find("#resumestream").hide(); 
    },

    showPlaySound: function(trackId) {
      this.$el.find("#player-container").hide();
      this.$el.find("#track-info").html("");

      this.$el.find("#loading").hide();
      this.$el.find("#no-tracks").hide();
      this.$el.find("#start-trail").show();
      this.$el.find("#start").show();
    },

    showNoTracksAvailable: function(trackId) {
      this.$el.find("#player-container").hide();
      this.$el.find("#track-info").html("");

      this.$el.find("#loading").hide();
      this.$el.find("#start-trail").hide();
      this.$el.find("#no-tracks").show();
      this.$el.find("#start").show();
    },

  });

  var appView = new AppView({ model: new UserPosition() });


})(jQuery);

