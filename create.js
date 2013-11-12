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
  *    USER LOGIN
  *
  --------------------------------------*/
  var UserLogin = Backbone.Model.extend({
    defaults: {
      loggedIn: false
    },
    initialize: function(){
      // Check if user is already logged in
      var act=getCookie("SC_act");
      if ( act != null && act != "")
        this.set({ loggedIn: true });
    },
    isLoggedIn: function() {
      return this.get('loggedIn');
    },
    login: function() {
      this.set({'loggedIn': true})
    },
    logout: function() {
      this.set({'loggedIn': false})
    }
  });

  // View for displaying user position
  LoginView = Backbone.View.extend({
    el: $("#login-container"),

    events: {
      'click button#login': 'login',
      'click button#logout': 'logout'
    },
    initialize: function() {
      _.bindAll(this, 'render', 'login', 'logout');

      console.log("access " + SC.accessToken());

      this.model.on('change', this.render);
      
      this.render();
    },
    render: function() {
      this.$el.empty();

      if (this.model.isLoggedIn())
        this.$el.append("<button id='logout'>Log out</button>");
      else
        this.$el.append("<button id='login'>Log in to Soundcloud</button>");

      return this;
    },

    login: function() {
      var self = this;
      SC.connect(function(){
        // Update model
        self.model.login();
        // Store access token
        setCookie('SC_act', SC.accessToken(), 30);

        SC.get('/me/activities', function(data) { 
          
          console.log(data);
        }); 
      })
    },

    logout: function() {
      SC.accessToken(null); 
      this.model.logout();
      setCookie('SC_act', "", 30);   
      console.log("logout");
    }

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
      _.bindAll(this, 'render', 'update');

      this.listenTo(this.model, 'change', this.render);

      // Track user position 
        if (navigator.geolocation) 
          navigator.geolocation.watchPosition(this.update);
    },
    render: function() {
      console.log("Rendering position view");
      this.$el.html("Position: " + this.model.getLatitude() + ", " + this.model.getLongitude());  
      return this;
    },

    update: function(position) {
      console.log("Updating position in view");
      this.model.setPosition(position.coords.latitude, position.coords.longitude);
    }
  });

  /*--------------------------------------
  *
  *    TRACKS
  *
  --------------------------------------*/

  var Track = Backbone.Model.extend({
    defaults: function() {
      return {
        id: null,
        username: null,
        title: null,
        artwork: null,
        uri: null,
        length: 0
      };
    },
  });

  var TrackCollection = Backbone.Collection.extend({
    model: Track
  });

  // View for displaying user position
  TrackView = Backbone.View.extend({
    events: {
      'click button#add-to-map': 'addLocationToTrack'
    },

    initialize: function() {
      _.bindAll(this, 'render', 'addLocationToTrack');

      this.parent = this.options.parent;

      this.listenTo(this.model, 'add', this.render);
      this.listenTo(this.model, 'destroy', this.remove);

    },

    render: function() {
      this.$el.append( this.model.get("username") + ", " + this.model.get("title") + ", " + this.model.get("id") );  
      this.$el.append("<br><button id='add-to-map'>Add track to map</button>"); 
      return this;
    },

    addLocationToTrack: function () {
      this.parent.addLocationToTrack(this.model.get("id"));
    }
  });

  /*--------------------------------------
  *
  *    TRACK SEARCH
  *
  --------------------------------------*/
  SearchTrackView = Backbone.View.extend({
    el: $("#search-container"),

    events: {
      'click button#search': 'search'
    },

    initialize: function() {
      _.bindAll(this, 'render', 'search', 'addOne', 'addAll', 'addLocationToTrack');

      this.collection = new TrackCollection();

      this.parent = this.options.parent;

      this.collection.on('add', this.addOne);
      this.collection.on('reset', function(col, opts){
         _.each(opts.previousModels, function(model){
              model.trigger('destroy');
          });
      });
    },
    render: function() {
      console.log("render search");
      this.$el.append("<input type='text' id='search-field' >");
      this.$el.append("<button id='search'>Search for sound</button>");  
      this.input = $("#search-field");

      this.$el.append("<div id='search-result'></div>");  

      return this;
    },
    search: function() {
      this.collection.reset();

      var self = this;
      SC.get('/tracks', { q: this.input.val(), filter: "streamable" }, function(tracks, error) {
          _.each(tracks, function(value, index){
              
              var t = new Track({
                id: value.id,
                username: value.user.username,
                title: value.title,
                uri: value.uri
              });
              self.collection.add(t);
          });
      });
    },

    addOne: function(track) {
      var view = new TrackView({ model: track, parent: this.parent });
      this.$("#search-result").append(view.render().el);
    },

    addAll: function() {
      this.collection.each(this.addOne, this);
    },

    addLocationToTrack: function(trackId) {
      this.parent.addLocationToTrack(trackId);
    }
  });


  /*--------------------------------------
  *
  *    APP VIEW
  *
  --------------------------------------*/

  var AppView = Backbone.View.extend({
    el: $("#create-container"),

    events: {
      'click .save': 'saveTrackLocation',
      'click .cancel': 'closeSelectLocation'
    },

    initialize: function(){
       _.bindAll(this, 'render', 'initMap', 'addLocationToTrack', 'saveTrackLocation', 'closeSelectLocation'); 
 
      // User login subview
      //this.loginView = new LoginView({ model: new UserLogin() });
      // Trackearch subview
      this.searchView = new SearchTrackView({ parent: this });  
      this.render();

      if (navigator.geolocation)
        navigator.geolocation.getCurrentPosition(this.initMap);

      // Blank dummy sound, fixingaudio loading issue on mobile browsers
      SC.stream("/tracks/118451467", {
          useHTML5Audio: true,
          preferFlash: false
        }, function(sound){  
          this.track = sound; 
      });
      
    },

    render: function() {

      this.$el.find("#search-container").append(this.searchView.render().el);

      return this;
    },

    initMap: function(position) {
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
      };
      this.map = new google.maps.Map(document.getElementById("create-map"), mapOptions);
      this.mapElem = $("#map-container");

      this.positionMarker = new google.maps.Marker({ map: this.map });

      var self = this;
      google.maps.event.addListener(this.map, 'click', function(event) {
        
        self.positionMarker.setPosition(event.latLng);
      });
    },

    addLocationToTrack: function(trackId) {
      this.trackId = trackId;
      //this.positionMarker = null;
      this.$el.find("search-container").hide();
      this.mapElem.css("visibility", "visible");
    },

    saveTrackLocation: function() {
      if (!this.positionMarker.getPosition())
        return;
      var Sound = Parse.Object.extend("Sound");
      var sound = new Sound();
       
      sound.set("trackId", this.trackId + "");
      sound.set("position", new Parse.GeoPoint({ 
        latitude: this.positionMarker.getPosition().lat(), 
        longitude: this.positionMarker.getPosition().lng()
      }));
      
      var self = this;
      sound.save(null, {
        success: function(sound) {
          console.log("track added to map");
          self.closeSelectLocation();
        },
        error: function(sound, error) {
          console.log(error);
        }
      });

    },

    closeSelectLocation: function() {
      this.mapElem.css("visibility", "hidden");
      this.$el.find("search-container").show();
    }

  });

  var appView = new AppView();


})(jQuery);

