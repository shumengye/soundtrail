(function($){

  // Parse setup
  Parse.initialize("pl5Mrd7JuevIbDeog6COfDCrUI4UMKResND4uV9l", "SYG3E16QhUpmF3tFv5WLGYJirJbi5yXMCRZ6j00m");

  // SoundCloud setup
  SC.initialize({
    client_id: "20c747bd72eaa3c7d88dbc712ca696b0",
    redirect_uri: "https://dl.dropboxusercontent.com/u/986362/soundmap/callback.html",
  });

  // Sound model
  var Sound = Parse.Object.extend("Sound");


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

      this.model.on('change', this.render);

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

      return this;
    },


    playByPosition: function() {

      // Get current location
      var userPosition = new Parse.GeoPoint({
        latitude: this.userPositionView.model.getLatitude(), 
        longitude: this.userPositionView.model.getLongitude()
      });
      
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

  // User login model
  var UserLogin = Backbone.Model.extend({
    defaults: {
      loggedIn: false
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
        self.model.login();
        SC.get('/me/activities', function(data) { 
          console.log(data);
        }); 
      })
    },

    logout: function() {
      SC.accessToken(null); 
      this.model.logout();
      console.log("logout");
    }

  });  


  var appView = new AppView();

/*
  var track_url = 'http://soundcloud.com/forss/flickermood';
SC.oEmbed(track_url, { auto_play: true }, function(oEmbed) {
  console.log('oEmbed response: ' + oEmbed);
});
*/

})(jQuery);

