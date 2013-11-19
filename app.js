

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
        username: null,
        title: null,
        artwork_url: null,
        permalink_url: null,
        duration: null,
        position: null  // Parse GeoPoint
      };
    },
  });

  var TrackCollection = Backbone.Collection.extend({
    model: Track
  });

  //------------------------------
  //
  // PLAYER VIEW
  //
  //------------------------------
  var PlayerView = Backbone.View.extend({
     
    events: {
      'click #start-trail': 'startPlayback',
      'click #pausestream': 'pausePlayback',
      'click #resumestream': 'resumePlayback',
    },

    initialize:function(){
       //_.bindAll(this, 'startPlayback');

      this.model = new Track();
      this.streamingTrack = null // SoundManager object of track being currently played or paused
      this.trackId = null // id of track being currently played or paused

      this.listenTo(this.model, 'change', _.bind(this.render, this));  

       // Blank dummy sound, fixingaudio loading issue on mobile browsers
       var self = this;
      SC.stream("/tracks/118451467", {
          useHTML5Audio: true,
          preferFlash: false
        }, function(sound){  
          self.blankTrack = sound;
      });

      this.showLoading = true;
    },

    render: function () {
      if (this.showLoading) {
        var template = _.template($('#player-simple-template').html(), { message: "Loading sounds near your..." });
        this.showLoading = false;
      }
      else if (this.hasOngoingPlayback()) {
        // Available track has changed but playback still ongoing, do nothing
        if (this.model == null || (this.trackId != this.model.get("id")))
          return;  
        var template = _.template($('#player-track-playing-template').html(), { track: this.model });
      }
      else if (this.hasTrackAvailable()) 
          var template = _.template($('#player-track-available-template').html(), { track: this.model });
      else 
        var template = _.template($('#player-simple-template').html(), { message: "No tracks found.<br>Try moving closer to a sound."  });

      this.$el.html(template);

      if (this.streamingTrack && this.streamingTrack.paused) {
        this.$el.find("#pausestream").hide();
        this.$el.find("#resumestream").show();
      }
    }, 


    hasTrackAvailable: function() {
      if (this.model.get("id"))
        return true;
      return false;
    },

    hasOngoingPlayback: function() {
      if (this.streamingTrack == null)
        return false;
      if (this.streamingTrack.paused || this.streamingTrack.playState == 1)
        return true;
      return false;
    },

    startPlayback: function() {
      console.log("Here " + this.blankTrack);
      if (this.blankTrack) 
        this.blankTrack.play({ onfinish: _.bind(this.playNext, this) });
    },

    playNext: function() {
      if (!this.hasTrackAvailable() && !this.hasOngoingPlayback()) {
        this.streamingTrack = null;
        this.trackId = null;
        this.render();
        return;
      }
    
      var self = this;
      var id = this.model.get("id");
      SC.stream(id, { useHTML5Audio: true, preferFlash: false }, 
        function(sound) {
          sound.play({ onfinish: function() { self.playNext(); } });
          self.streamingTrack = sound;
          self.trackId = id;
          self.render();
        }
      );
    },

    pausePlayback: function() {
      if (this.hasOngoingPlayback) {
        this.streamingTrack.pause();
        this.$el.find("#pausestream").hide();
        this.$el.find("#resumestream").show();
      }
    }, 

    resumePlayback: function() {
      if (this.streamingTrack != null)
        this.streamingTrack.resume();
        this.$el.find("#resumestream").hide();
        this.$el.find("#pausestream").show();
    }

  });


  //------------------------------
  //
  // MAP VIEW
  //
  //------------------------------
  var MapView = Backbone.View.extend({
    el: '#map-canvas',
     
    initialize:function(){
      // Track collections
      this.tracks = new TrackCollection();
      this.trackMarkers = [];

      this.listenTo(this.tracks, 'add', _.bind(this.addTrack, this)); 
      this.listenTo(this.tracks, 'reset', _.bind(this.resetTracks, this)); 

      // Map options
      google.maps.visualRefresh = true;
      this.mapOptions = {
        center: new google.maps.LatLng(52, 13),
        zoom: 15,
        maxZoom: 17,
        minZoom: 11,
        panControl: false,
        streetViewControl: false,
        mapTypeControl: false,
        zoomControlOptions: { position: google.maps.ControlPosition.LEFT_CENTER }
      };

      this.userMarker = new google.maps.Marker({
        position: new google.maps.LatLng(52, 13),
        icon: "assets/userposition.svg",
        zIndex: 100
      });

      this.map = null;
    },

    create: function() {
      this.map = new google.maps.Map(document.getElementById("map-canvas"), this.mapOptions);
    },

    setPosition: function(lat, lng) {
      this.userMarker.setMap(this.map);
      this.userMarker.setPosition(new google.maps.LatLng(lat, lng));
    },

    setCenter: function(lat, lng) {
      this.map.setCenter(new google.maps.LatLng(lat, lng));
    },

    addTrack: function(track) {
      var iconsize = 30;
      var image = {
        url: track.get("artwork_url"),
        size: new google.maps.Size(iconsize, iconsize),
        origin: new google.maps.Point(0,0),
        anchor: new google.maps.Point(iconsize/2, iconsize),
        scaledSize: new google.maps.Size(iconsize, iconsize)
      };
      var shape = {
          coord: [1, 1, 1, iconsize, iconsize, iconsize, iconsize, 1],
          type: 'poly'
      };

      var trackPos = new google.maps.LatLng(track.get("position").latitude, track.get("position").longitude);
      var marker = new google.maps.Marker({
        position: trackPos,
        icon: image,
        shape: shape,
        title: track.get("title")
      });
      marker.setMap(this.map);

      this.trackMarkers.push({ id: track.get("id"), marker: marker }); 
    },

    resetTracks: function() {
      for (var i = 0; i < this.trackMarkers.length; i++) 
        this.trackMarkers[i].marker.setMap(null);
      this.trackMarkers = [];
    }

  });

  //------------------------------
  //
  // APP VIEW
  //
  //------------------------------
  var AppView = Backbone.View.extend({
    el: '#app-container',

    template: _.template($("#app-template").html()),

    events: {
      'click #start-trail': 'startPlayback',
      'click #pausestream': 'pausePlayback',
      'click #resumestream': 'resumePlayback',
    },
     
    initialize: function() {
      this.$el.html(this.template);

      this.mapView = new MapView();
      this.playerView = new PlayerView();
      this.userPosition = new UserPosition();
      this.distance = 0.05; // 50 meters

      // User location
      this.listenTo(this.userPosition, 'change', _.bind(this.render, this)); 
      this.listenTo(this.userPosition, 'change', _.bind(this.updateClosestTrack, this)); 

      if (navigator.geolocation) {
        // Keep tracking user position 
        navigator.geolocation.getCurrentPosition(_.bind(this.initPosition, this));
        navigator.geolocation.watchPosition(_.bind(this.setPosition, this));
      }
      
      /*
      var self = this;
      window.setTimeout(function() {
        // ohlauer 52.495317,13.430207
        // lautsizer 52.496504, 13.427037
        // forster 52.494934,13.432402
        // reichenberger
        console.log("switching user position");
        self.userPosition.setPosition(52.494934,13.432402); 
      }, 8000);

      window.setTimeout(function() {
        console.log("switching user position");
        self.userPosition.setPosition(52.494266,13.434609); 
      }, 15000);

      window.setTimeout(function() {
        console.log("switching user position");
        self.userPosition.setPosition(52.494934,13.432402); 
      }, 25000);

      window.setTimeout(function() {
        console.log("switching user position");
        self.userPosition.setPosition(52.495317,13.430207); 
      }, 33000);
    */
    },

    render: function () { 
      if (this.userPosition.getLatitude() != null) {
        this.mapView.setPosition(this.userPosition.getLatitude(), this.userPosition.getLongitude());
      }

      this.playerView.delegateEvents();
      this.$el.append(this.playerView.$el);
      this.playerView.render();
    },

    // Because of auto update of user position: when app not active, render does nothing
    setActive: function(active) {
      if (active)
        this.$el.show();
      else
        this.$el.hide();
    },

    initPosition: function(position) {
      this.mapView.create();
      this.mapView.setCenter(position.coords.latitude, position.coords.longitude);
      this.userPosition.setPosition(position.coords.latitude, position.coords.longitude);
      // Redraw tracks on map only when map bounds change
      google.maps.event.addListener(this.mapView.map, 'bounds_changed', _.bind(this.updateTracksOnMap, this));
    },

    setPosition: function(position) {
      this.userPosition.setPosition(position.coords.latitude, position.coords.longitude);
    },

    updateClosestTrack: function() {
      if (!this.userPosition.getLatitude())
        return;
    
      this.playerView.model.clear();

      var Sound = Parse.Object.extend("Sound");
      var currentLocation = new Parse.GeoPoint({ latitude: this.userPosition.getLatitude(), longitude: this.userPosition.getLongitude() });
      var self = this;  

      var query = new Parse.Query(Sound);
      query.withinKilometers("position", currentLocation, this.distance);
      query.first().then(function(track) {  
        if (!track) {
          console.log("No available track found");
          return;
        }
        console.log("Available track found");
        var positions = {};
          
          // Fetch additional track info from SC
          SC.get('/tracks/' + track.get("trackId"), function(trackSC) {  

            var t = new Track({ id: trackSC.id, 
              position: track.get("position"),
              username: trackSC.user.username, 
              title: trackSC.title,
              duration: trackSC.duration,
              artwork_url: (trackSC.artwork_url ? trackSC.artwork_url : trackSC.user.avatar_url),
              permalink_url: trackSC.permalink_url
            });
   
            self.playerView.model.set({ id: t.get("id"), position: t.get("position"), duration: t.get("duration"), 
                username: t.get("username"), title: t.get("title"),
                artwork_url:  t.get("artwork_url"), permalink_url: t.get("permalink_url")
            });  
            
          });  
      }, function(error) {
        console.log(error);
      });

    },

    updateTracksOnMap: function() {
      if (!this.userPosition.getLatitude())
        return;

      var Sound = Parse.Object.extend("Sound");
      var currentLocation = new Parse.GeoPoint({ latitude: this.userPosition.getLatitude(), longitude: this.userPosition.getLongitude() });
      var self = this;  

      // Reset map view collections
      this.mapView.tracks.reset();

      // All tracks within maps bound, excluding playable tracks
      var query = new Parse.Query(Sound);
      //query2.doesNotMatchKeyInQuery("trackId", "trackId", query1);
      query.near("position", currentLocation);
      query.limit(50);
      query.find().then(function(tracks) {
        console.log("Tracks nearby found " + tracks.length);
        var positions = {};
        for (var i = 0; i < tracks.length; i++) {
          positions[tracks[i].get("trackId")] = tracks[i].get("position");
          
          // Fetch additional track info from SC
          SC.get('/tracks/' + tracks[i].get("trackId"), function(track) { 
            var title = track.user.username + ": " + track.title;
        
            var t = new Track({ id: track.id, 
              position: positions[track.id],
              username: track.user.username, 
              title: track.title,
              duration: track.duration,
              artwork_url: (track.artwork_url ? track.artwork_url : track.user.avatar_url),
              permalink_url: track.permalink_url 
            });

            self.mapView.tracks.add(t); // Add to collection
          });  
        }
      }, function(error) {
          console.log(error);
      });
    }
  });

  /*--------------------------------------
  *
  *    TRACK SEARCH VIEW
  *
  --------------------------------------*/
  SearchTrackView = Backbone.View.extend({
    template: _.template($("#search-track-template").html()), 

    events: {
      'click button#search': 'search'
    },

    initialize: function() {
      this.appView = this.options.appView;

      this.tracks = new TrackCollection();

      this.listenTo(this.tracks, 'add', _.bind(this.addTrack, this)); 
      this.tracks.on('reset', function(col, opts){
         _.each(opts.previousModels, function(model){
              model.trigger('destroy');
          });
      });

      this.searchQuery = null;

    },

    render: function() {
      this.$el.html(this.template({ }));

      // Remember current search
      if (this.searchQuery != null)
        this.search();
    },

    addTrack: function(track) {
      var trackView = new TrackView({ model: track, appView: this.appView });
      
      trackView.delegateEvents();
      this.$("#search-result").append(trackView.$el);
      trackView.render();
    },

    search: function() {
      if (this.$el.find("#search-field").val() && this.$el.find("#search-field").val() != "")
        this.searchQuery = this.$el.find("#search-field").val();

      console.log("search for tracks " + this.searchQuery);
      this.tracks.reset();

      var self = this;
      SC.get('/tracks', { q: this.searchQuery, filter: "streamable" }, function(tracks, error) {
          _.each(tracks, function(value, index){
              
            var t = new Track({
              id: value.id,
              username: value.user.username,
              title: value.title,
              permalink_url: value.permalink_url
            });
            self.tracks.add(t);
          });
      });
    }
  });

  /*--------------------------------------
  *
  *   VIEW FOR TRACK IN SEARCH RESULTS
  *
  --------------------------------------*/
  TrackView = Backbone.View.extend({
    template: _.template($("#track-searchresult-template").html()), 

    events: {
      'click button#add-to-map': 'addToMap'
    },

    initialize: function() {
      this.listenTo(this.model, 'destroy', this.remove);
      this.appView = this.options.appView;
    },

    render: function() {
      this.$el.html(this.template({ track: this.model }));
    },

    addToMap: function() {
      this.appView.onSelectTrack(this.model.get("id"));
    }
  });

  /*--------------------------------------
  *
  *   ADD TRACK LOCATION VIEW
  *
  --------------------------------------*/
  TrackLocationView = Backbone.View.extend({
    template: _.template($("#track-add-location-template").html()), 

    events: {
      'click button#add-to-map': 'addToMap',
      'click .cancel': 'close',
      'click .save': 'saveTrackPosition'
    },

    initialize: function() {
      this.model = new Track();

      this.userPosition = new UserPosition();
      this.listenTo(this.userPosition, 'change', _.bind(this.render, this)); 

      if (navigator.geolocation)
        navigator.geolocation.getCurrentPosition(_.bind(this.setPosition, this));

      google.maps.visualRefresh = true;
      this.mapOptions = {
        center: new google.maps.LatLng(52, 13),
        zoom: 15,
        maxZoom: 17,
        minZoom: 11,
        panControl: false,
        streetViewControl: false,
        mapTypeControl: false,
        zoomControlOptions: { position: google.maps.ControlPosition.LEFT_CENTER }
      };
    },

    render: function() {
      if (!this.isActive())
        return;

      this.$el.html(this.template({ }));

      if (this.userPosition.getLatitude() != null) {
        this.map = new google.maps.Map(document.getElementById("map-canvas2"), this.mapOptions);
        this.map.setCenter(new google.maps.LatLng(this.userPosition.getLatitude(), this.userPosition.getLongitude()));

        this.positionMarker = new google.maps.Marker({ map: this.map });

        var self = this;
        google.maps.event.addListener(this.map, 'click', function(event) {
          self.positionMarker.setPosition(event.latLng);
        });
      }
    },

    isActive: function() {
      if (this.model.get("id"))
        return true;
      return false;
    },

    setPosition: function(position) {
      this.userPosition.setPosition(position.coords.latitude, position.coords.longitude);
    },

    close: function() {
      this.model.clear();
    },

    saveTrackPosition: function() {
      if (!this.positionMarker.getPosition())
        return;
      var Sound = Parse.Object.extend("Sound");
      var sound = new Sound();
       
      sound.set("trackId", this.model.get("id") + "");
      sound.set("position", new Parse.GeoPoint({ 
        latitude: this.positionMarker.getPosition().lat(), 
        longitude: this.positionMarker.getPosition().lng()
      }));
      
      var self = this;
      sound.save(null, {
        success: function(sound) {
          console.log("track added to map");
          self.close();
        },
        error: function(sound, error) {
          console.log(error);
        }
      });
    }
  });

 
  /*--------------------------------------
  *
  *    CREATE VIEW
  *
  --------------------------------------*/
  var CreateView = Backbone.View.extend({
    el: '#create-container',
    
    template: _.template($("#create-template").html()), 

    events: {
      
    },

    initialize: function(){
      this.searchView = new SearchTrackView({ appView: this });
      this.trackLocationView = new TrackLocationView();

      this.listenTo(this.trackLocationView.model, 'change', _.bind(this.render, this)); 
    },

    render: function() {
      this.$el.html(this.template);

      if (!this.trackLocationView.isActive()) {
        this.searchView.delegateEvents();
        this.$el.append(this.searchView.$el);
        this.searchView.render();
      }
      else {
        this.trackLocationView.delegateEvents();
        this.$el.append(this.trackLocationView.$el);
        this.trackLocationView.render();
      }
    },

    setActive: function(active) {
      if (active)
        this.$el.show();
      else
        this.$el.hide();
    },

    onSelectTrack: function(trackId) {
      console.log("track selected " + trackId);
      this.trackLocationView.model.set({ id: trackId });
      this.render();
    }
  });

  /*--------------------------------------
  *
  *    ROUTING
  *
  --------------------------------------*/

  var AppRouter = Backbone.Router.extend({
    routes: {
      "": "home",
      "add": "add"
    }
  });

  var appView = new AppView();
  var createView = new CreateView();

  var app_router = new AppRouter;
  app_router.on('route:home', function (id) {
    console.log("home");
    // AppView.setactive determines if default app should be rendered 
    // because user position is auto-updating with geoLocation
    createView.setActive(false);
    appView.setActive(true);
    appView.render();
  });

  app_router.on('route:add', function (id) {
    console.log("create");
    appView.setActive(false);
    createView.setActive(true);
    createView.render();
  });
 
  Backbone.history.start();
  

})(jQuery);

