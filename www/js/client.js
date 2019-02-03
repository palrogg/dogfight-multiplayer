var WIDTH = 1100;
var HEIGHT = 580;
var socket = io.connect();

//var socket = io.connect();
var game = new Game('#arena', WIDTH, HEIGHT, socket);
var selectedShip = 'leviathan';
var shipName = '', shipId = new Date().getTime() + Math.floor(Math.random() * 1000);

socket.on('addShip', function(ship){
	game.addShip(ship.id, ship.name, ship.type, ship.isLocal, ship.x, ship.y);
});

socket.on('sync', function(gameServerData){
	game.receiveData(gameServerData);
});

socket.on('killShip', function(shipData){
	console.log('killShip socket received')
	game.killShip(shipData);
});

socket.on('updateLeaderBoard', function(scoreData){
	console.log('Got a leaderboard update:')
	console.log(scoreData);
	console.log(typeof(scoreData));

	scoreData.forEach(function(ship){
		$('tr#' + ship.id).html(`
				<td></td>
				<td>` + ship.name + `</td>
				<td>` + ship.kills + `</td>
				<td>` + ship.rank + `</td>
			`);
	});

})

socket.on('removeShip', function(shipId){
	console.log('removeShip socket received for ship' + shipId)
	game.removeShip(shipId);
});

socket.on('respawnShip', function(){
	console.log('respawn ship');
	game.respawnShip();
});

$(document).ready( function(){

	$('#join').click( function(){
		shipName = $('#ship-name').val();
		joinGame(shipName, selectedShip, socket);
	});

	$('#ship-name').keyup( function(e){
		shipName = $('#ship-name').val();
		var k = e.keyCode || e.which;
		if(k == 13){
			joinGame(shipName, selectedShip, socket);
		}
	});

	$('ul.ship-selection li').click( function(){
		$('.ship-selection li').removeClass('selected')
		$(this).addClass('selected');
    selectedShip = $(this).data('ship');
	});

});

$(window).on('beforeunload', function(){
	socket.emit('leaveGame', shipId);
});

function joinGame(shipName, shipType, socket){
	if(shipName != ''){
		$('#prompt').hide();
		socket.emit('joinGame', {id: shipId, name: shipName, type: shipType});
	}
}
function sendRespawnRequest(shipId){
	console.log('Sending respawn request')
	socket.emit('respawnRequest', shipId);
}
