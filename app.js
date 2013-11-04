(function($){

  // Parse setup
  Parse.initialize("pl5Mrd7JuevIbDeog6COfDCrUI4UMKResND4uV9l", "SYG3E16QhUpmF3tFv5WLGYJirJbi5yXMCRZ6j00m");

  // SoundCloud setup
  SC.initialize({
    client_id: "20c747bd72eaa3c7d88dbc712ca696b0"
  });

  // Sound model
  var Sound = Parse.Object.extend("Sound");

  // User position model
  var UserPosition = Backbone.Model.extend({
    defaults: {
      lat: null,
      lng: null
    },
     initialize: function(){
      
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
      var m = this.model.toJSON();
      this.$el.html("Position: " + m.lat + ", " + m.lng);  
      return this;
    },

    update: function(position) {
      console.log("Updating position in view");
      this.model.set({ lat: position.coords.latitude, lng: position.coords.longitude  });
    }
  });


  var AppView = Backbone.View.extend({
    el: $("#container"),

    events: {
      'click button#play-by-position': 'startStream'
    },

    initialize: function(){
       _.bindAll(this, 'render', 'playByPosition', 'startStream'); 

      this.render();
      this.addUserPosition(this.model);

      
      // Blank dummy sound, fixingaudio loading issue on mobile browsers
      SC.stream("/tracks/118451467", {
          useHTML5Audio: true,
          preferFlash: false
        }, function(sound){  
          this.track = sound; 
      });
      
    },

    render: function(){

      this.$el.append("<button id='play-by-position'>play by location</button>");
      this.input = this.$('#track-id');

      return this;
    },

    addUserPosition: function(model) {
        var view = new UserPositionView({
            'model': model
        });
        this.$el.append(view.render().el);
    },

    playByPosition: function() {

      // Get current location
      var m = this.model.toJSON();
      console.log("Play by current position " + m.lat + "," + m.lng);
      var userPosition = new Parse.GeoPoint({latitude: m.lat, longitude: m.lng});
      
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


  var userPosition = new UserPosition({ });
  var appView = new AppView({ model: userPosition });

})(jQuery);

