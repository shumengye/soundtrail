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
      'click button#add-to-map': 'addTrackToMap'
    },

    initialize: function() {
      _.bindAll(this, 'render', 'addTrackToMap');

      this.parent = this.options.parent;

      this.listenTo(this.model, 'add', this.render);
      this.listenTo(this.model, 'destroy', this.remove);

    },

    render: function() {
      this.$el.append( this.model.get("username") + ", " + this.model.get("title") + ", " + this.model.get("id") );  
      this.$el.append("<button id='add-to-map'>Add track to map</button>"); 
      return this;
    },

    addTrackToMap: function () {
      var Sound = Parse.Object.extend("Sound");
      var sound = new Sound();
       
      sound.set("trackId", this.model.get("id") + "");
      var point = this.parent.currentUserPosition();
      sound.set("position", new Parse.GeoPoint({ latitude: point[0], longitude: point[1] }));
       
      sound.save(null, {
        success: function(sound) {
          console.log("track added to map");
        },
        error: function(sound, error) {
          console.log(error.description);
        }
      });
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
      _.bindAll(this, 'render', 'search', 'addOne', 'addAll');

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
      this.$el.append("<button id='search'>Search track</button>");  
      this.input = $("#search-field");

      this.$el.append("<div id='search-result'></div>");  

      return this;
    },
    search: function() {
      this.collection.reset();

      var self = this;
      SC.get('/tracks', { q: this.input.val() }, function(tracks, error) {
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
      'click button#play-by-position': 'startStream'
    },

    initialize: function(){
       _.bindAll(this, 'render', 'playByPosition', 'startStream'); 

      // User position subview
      this.userPositionView = new UserPositionView({ model: new UserPosition() });   
      // User login subview
      this.loginView = new LoginView({ model: new UserLogin() });
      // Trackearch subview
      this.searchView = new SearchTrackView({ parent: this });  

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

      this.$el.append(this.loginView.render().el);

      this.$el.append(this.searchView.render().el);

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
      query.near("position", userPosition);
      var self = this;
 
      query.first({
        success: function(object) {
          var trackId = object.get("trackId");
          console.log("Fetched track from Parse " + trackId);

          SC.stream(trackId, {
            useHTML5Audio: true,
            preferFlash: false
          }, function(sound){

            sound.play({onfinish: self.playByPosition});
          });
          
        },
        error: function(error) {
          alert("Error: " + error.code + " " + error.message);
        }
      });

    },

    startStream: function() {
      track.play({onfinish: this.playByPosition});
    }

  });

  var appView = new AppView();


})(jQuery);

