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
      _.bindAll(this, 'render', 'update', 'initLocation', 'drawTracks', 'renderTrack');

      this.listenTo(this.model, 'change', this.render);

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

      return this;
    },

    initLocation: function(position) {
      this.model.setPosition(position.coords.latitude, position.coords.longitude);
      console.log("setting location");
      //this.map.setCenter(new google.maps.LatLng(position.coords.latitude, position.coords.longitude));
      
      google.maps.visualRefresh = true;
      var mapOptions = {
            center: new google.maps.LatLng(position.coords.latitude, position.coords.longitude),
            zoom: 15,
            mapTypeId: google.maps.MapTypeId.ROADMAP} ;
      this.map = new google.maps.Map(document.getElementById("map-canvas"), mapOptions);

      this.drawTracks();
    },

    update: function(position) {
      console.log("Updating position in view");
      this.model.setPosition(position.coords.latitude, position.coords.longitude);

    },

    drawTracks: function() {
      var Sound = Parse.Object.extend("Sound");
      var query = new Parse.Query(Sound);

      var userPosition = new Parse.GeoPoint({
        latitude: this.model.getLatitude(), 
        longitude: this.model.getLongitude()
      });

      query.near("position", userPosition);
      query.limit(20);
      //var distance = 0.1; // max distance in km
      //query.withinKilometers("position", userPosition, distance);

      var self = this;
      query.find().then(function(tracks) {
        for (var i = 0; i < tracks.length; i++) {
          self.renderTrack(tracks[i]);
        }
      }, function(error) {
        console.log(error);
      });
    },

    // Renders a single track
    renderTrack: function(trackObj) {
      var trackId = trackObj.get("trackId");
      // Create marker 
      var position = trackObj.get("position");
      var trackPos = new google.maps.LatLng(position.latitude, position.longitude);
      var marker = new google.maps.Marker({
        position: trackPos,
        title:""
      });
      marker.setMap(this.map);

      // Get other track info from SC
      SC.get('/tracks/' + trackId, function(track) { 
        //console.log(track); 
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
      'click button#play-by-position': 'startStream'
    },

    initialize: function(){
       _.bindAll(this, 'render', 'playByPosition', 'startStream'); 

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
          });
      }, function(error) {
        console.log(error);
       
      });
      

    },

    startStream: function() {
      track.play({onfinish: this.playByPosition});
    }

  });

  var appView = new AppView();


})(jQuery);

