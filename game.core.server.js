/*  Copyright 2012-2016 Sven "underscorediscovery" Bergström
    
    written by : http://underscorediscovery.ca
    written for : http://buildnewgames.com/real-time-multiplayer/
    
    MIT Licensed.
*/

//The main update loop runs on requestAnimationFrame,
//Which falls back to a setTimeout loop on the server
//Code below is from Three.js, and sourced from links below

    // http://paulirish.com/2011/requestanimationframe-for-smart-animating/
    // http://my.opera.com/emoller/blog/2011/12/20/requestanimationframe-for-smart-er-animating

    // requestAnimationFrame polyfill by Erik Möller
    // fixes from Paul Irish and Tino Zijdel

        //Now the main game class. This gets created on
        //both server and client. Server creates one for
        //each game that is hosted, and client creates one
        //for itself to play the game.

/* The game_core class */

var game_core = new Class(
{
initialize: function(game_instance)
{

            //Store the instance, if any
        this.instance = game_instance;
            //Store a flag if we are the server
        this.server = this.instance !== undefined;

            //Used in collision etc.
        this.world = {
            width : 720,
            height : 480
        };

       	//We create a player set, passing them
        //the game that is running them, as well

            this.players = {
                self : new game_player(this,this.instance.player_host),
                other : new game_player(this,this.instance.player_client)
            };

           this.players.self.pos = {x:20,y:20};

            //The speed at which the clients move.
        this.playerspeed = 120;

            //Set up some physics integration values
        this._pdt = 0.0001;                 //The physics update delta time
        this._pdte = new Date().getTime();  //The physics update last delta time
            //A local timer for precision on server and client
        this.local_time = 0.016;            //The local timer
        this._dt = new Date().getTime();    //The local timer delta
        this._dte = new Date().getTime();   //The local timer last frame time

            //Start a physics loop, this is separate to the rendering
            //as this happens at a fixed frequency
        this.create_physics_simulation();

            //Start a fast paced timer for measuring time easier
        this.create_timer();

            this.server_time = 0;
            this.laststate = {};

    }, //game_core.constructor


/*
    Helper functions for the game code

        Here we have some common maths and game related code to make working with 2d vectors easy,
        as well as some helpers for rounding numbers to fixed point.

*/

    //copies a 2d vector like object from one to another
pos: function(a) { return {x:a.x,y:a.y}; },
    //Add a 2d vector with another one and return the resulting vector
v_add: function(a,b) { return { x:(a.x+b.x).fixed(), y:(a.y+b.y).fixed() }; },
    //Subtract a 2d vector with another one and return the resulting vector
   //For the server, we need to cancel the setTimeout that the polyfill creates
stop_update: function() {  window.cancelAnimationFrame( this.updateid );  },



    //Main update loop
update: function(t) {
    
        //Work out the delta time
    this.dt = this.lastframetime ? ( (t - this.lastframetime)/1000.0).fixed() : 0.016;

        //Store the last frame time
    this.lastframetime = t;

        //Update the game specifics
        this.server_update();

        //schedule the next update
    this.updateid = window.requestAnimationFrame( this.update.bind(this), this.viewport );

}, //game_core.update


/*
    Shared between server and client.
    In this example, `item` is always of type game_player.
*/
check_collision: function( item ) {

        //Left wall.
    if(item.pos.x <= item.pos_limits.x_min) {
        item.pos.x = item.pos_limits.x_min;
    }

        //Right wall
    if(item.pos.x >= item.pos_limits.x_max ) {
        item.pos.x = item.pos_limits.x_max;
    }
    
        //Roof wall.
    if(item.pos.y <= item.pos_limits.y_min) {
        item.pos.y = item.pos_limits.y_min;
    }

        //Floor wall
    if(item.pos.y >= item.pos_limits.y_max ) {
        item.pos.y = item.pos_limits.y_max;
    }

        //Fixed point helps be more deterministic
    item.pos.x = item.pos.x.fixed(4);
    item.pos.y = item.pos.y.fixed(4);
    
}, //game_core.check_collision


process_input:  function( player ) {

    //It's possible to have recieved multiple inputs by now,
    //so we process each one
    var x_dir = 0;
    var y_dir = 0;
    var ic = player.inputs.length;
    if(ic) {
        for(var j = 0; j < ic; ++j) {
                //don't process ones we already have simulated locally
            if(player.inputs[j].seq <= player.last_input_seq) continue;

            var input = player.inputs[j].inputs;
            var c = input.length;
            for(var i = 0; i < c; ++i) {
                var key = input[i];
                if(key == 'l') {
                    x_dir -= 1;
                }
                if(key == 'r') {
                    x_dir += 1;
                }
                if(key == 'd') {
                    y_dir += 1;
                }
                if(key == 'u') {
                    y_dir -= 1;
                }
            } //for all input values

        } //for each input command
    } //if we have inputs

        //we have a direction vector now, so apply the same physics as the client
    var resulting_vector = this.physics_movement_vector_from_direction(x_dir,y_dir);
    if(player.inputs.length) {
        //we can now clear the array since these have been processed

        player.last_input_time = player.inputs[ic-1].time;
        player.last_input_seq = player.inputs[ic-1].seq;
    }

        //give it back
    return resulting_vector;

}, //game_core.process_input



physics_movement_vector_from_direction: function(x,y) {

        //Must be fixed step, at physics sync speed.
    return {
        x : (x * (this.playerspeed * 0.015)).fixed(3),
        y : (y * (this.playerspeed * 0.015)).fixed(3)
    };

}, //game_core.physics_movement_vector_from_direction

update_physics:  function() {

    if(this.server) {
        this.server_update_physics();
    } else {
        this.client_update_physics();
    }

}, //game_core.prototype.update_physics

/*

 Server side functions
 
    These functions below are specific to the server side only,
    and usually start with server_* to make things clearer.

*/

    //Updated at 15ms , simulates the world state
server_update_physics: function() {

        //Handle player one
    this.players.self.old_state.pos = this.pos( this.players.self.pos );
    var new_dir = this.process_input(this.players.self);
    this.players.self.pos = this.v_add( this.players.self.old_state.pos, new_dir );

        //Handle player two
    this.players.other.old_state.pos = this.pos( this.players.other.pos );
    var other_new_dir = this.process_input(this.players.other);
    this.players.other.pos = this.v_add( this.players.other.old_state.pos, other_new_dir);

        //Keep the physics position in the world
    this.check_collision( this.players.self );
    this.check_collision( this.players.other );

    this.players.self.inputs = []; //we have cleared the input buffer, so remove this
    this.players.other.inputs = []; //we have cleared the input buffer, so remove this

}, //game_core.server_update_physics

    //Makes sure things run smoothly and notifies clients of changes
    //on the server side
server_update: function(){

        //Update the state of our local clock to match the timer
    this.server_time = this.local_time;

        //Make a snapshot of the current state, for updating the clients
    this.laststate = {
        hp  : this.players.self.pos,                //'host position', the game creators position
        cp  : this.players.other.pos,               //'client position', the person that joined, their position
        his : this.players.self.last_input_seq,     //'host input sequence', the last input we processed for the host
        cis : this.players.other.last_input_seq,    //'client input sequence', the last input we processed for the client
        t   : this.server_time                      // our current local time on the server
    };

        //Send the snapshot to the 'host' player
    if(this.players.self.instance) {
        this.players.self.instance.emit( 'onserverupdate', this.laststate );
    }

        //Send the snapshot to the 'client' player
    if(this.players.other.instance) {
        this.players.other.instance.emit( 'onserverupdate', this.laststate );
    }

}, //game_core.server_update


handle_server_input: function(client, input, input_time, input_seq) {

        //Fetch which client this refers to out of the two
    var player_client =
        (client.userid == this.players.self.instance.userid) ?
            this.players.self : this.players.other;

        //Store the input on the player instance for processing in the physics loop
   player_client.inputs.push({inputs:input, time:input_time, seq:input_seq});

}, //game_core.handle_server_input

create_timer: function(){
    setInterval(function(){
        this._dt = new Date().getTime() - this._dte;
        this._dte = new Date().getTime();
        this.local_time += this._dt/1000.0;
    }.bind(this), 4);
},

create_physics_simulation: function() {

    setInterval(function(){
        this._pdt = (new Date().getTime() - this._pdte)/1000.0;
        this._pdte = new Date().getTime();
        this.update_physics();
    }.bind(this), 15);

} //game_core.client_create_physics_simulation

});


/*
    The player class

        A simple class to maintain state of a player on screen,
        as well as to draw that state when required.
*/

    var game_player = function( game_instance, player_instance ) {

            //Store the instance, if any
        this.instance = player_instance;
        this.game = game_instance;

            //Set up initial values for our state information
        this.pos = { x:0, y:0 };
        this.size = { x:16, y:16, hx:8, hy:8 };
        this.state = 'not-connected';
        this.color = 'rgba(255,255,255,0.1)';
        this.info_color = 'rgba(255,255,255,0.1)';
        this.id = '';

            //These are used in moving us around later
        this.old_state = {pos:{x:0,y:0}};
        this.cur_state = {pos:{x:0,y:0}};
        this.state_time = new Date().getTime();

            //Our local history of inputs
        this.inputs = [];

            //The world bounds we are confined to
        this.pos_limits = {
            x_min: this.size.hx,
            x_max: this.game.world.width - this.size.hx,
            y_min: this.size.hy,
            y_max: this.game.world.height - this.size.hy
        };

            //The 'host' of a game gets created with a player instance since
            //the server already knows who they are. If the server starts a game
            //with only a host, the other player is set up in the 'else' below
        if(player_instance) {
            this.pos = { x:20, y:20 };
        } else {
            this.pos = { x:500, y:200 };
        }

    }; //game_player.constructor
  
    game_player.prototype.draw = function(){

            //Set the color for this player
        game.ctx.fillStyle = this.color;

            //Draw a rectangle for us
        game.ctx.fillRect(this.pos.x - this.size.hx, this.pos.y - this.size.hy, this.size.x, this.size.y);

            //Draw a status update
        game.ctx.fillStyle = this.info_color;
        game.ctx.fillText(this.state, this.pos.x+10, this.pos.y + 4);
    
    }; //game_player.draw
    
	// (4.22208334636).fixed(n) will return fixed point value to n places, default n = 3
Number.prototype.fixed = function(n) { n = n || 3; return parseFloat(this.toFixed(n)); };

    module.exports = game_core;
