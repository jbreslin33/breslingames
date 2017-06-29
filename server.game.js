
var ServerGame = new Class(
{

initialize: function(player)
{
       	this.UUID = require('node-uuid'),
	this.id = this.UUID()
	this.player_host = player;
	this.player_client = null;
	this.player_count = 1;
	
}
});
module.exports = ServerGame;

