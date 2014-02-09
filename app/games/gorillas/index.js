// Created:            Thu 31 Oct 2013 12:06:16 PM GMT
// Last Modified:      Sun 09 Feb 2014 02:52:40 PM EST
// Author:             James Pickard <james.pickard@gmail.com>
// --------------------------------------------------
// Summary
// ----
// This is the example gorillas game that comes with
// https://github.com/euoia/node-games-lobby.
// --------------------------------------------------
// TODOs
// ----
// TODO: Handle reconnections, resuming the game.
// TODO: Handle observers (non-players) in the connection event.
// TODO: Document the events emitted and received by this game.

function Gorillas () {
  // Player array.
  // Value is player object.
  // Player object has the keys: username, socket, ready
  this.players = [];

  // Which player has the first turn this round?
  // 0 => Player 0, 1 => Player 1.
  this.startingPlayer = 0;

  // How many turns have passed?
  this.turnNumber = null;

  // Store the number of wins for each player.
  this.wins = [0, 0];
  this.maxRounds = 3;

  // The building data.
  this.buildings = null;

  // The index of each gorilla's building.
  this.gorillaBuildings = null;

  // The player has thrown their banana.
  // TODO: This could be cleaner.
  this.socketEventHandlers = {
    'ready': this.ready,
    'throwBanana': this.throwBanana,
    'endRound': this.endRound
  };

  this.mapWidth = 80;
  this.mapHeight = 50;
}

Gorillas.prototype.getPlayerByUsername = function(username) {
  for (var i = 0; i < this.players.length; i += 1) {
    var player = this.players[i];
    if (player.username === username) {
      return player;
    }
  }
  return null;
};

// --------------------------------------------------
// Express routes.

// Express request route that loads the game page.
Gorillas.prototype.play = function (req, res) {
  // TODO: This should probably be handled at a different layer.
  if (req.session.username === undefined) {
    return res.send(403, 'You must login before you can view games.');
  }

  // Render the game page.
  console.log('gorillas: %s loaded the launch page.', req.session.username);
  return res.render('games/gorillas/index.html', { title: 'Gorillas' });
};


// --------------------------------------------------
// Methods required by the game server API.

// Game.getConfig(configName)
// Return a game configuration item.
Gorillas.getConfig = function(configName) {
  var config = {
    minPlayers: 2,
    maxPlayers: 2,
    launchVerb: 'play'
  };

  return config[configName];
};

// Game.prototype.connection(err, socket, session)
// After the player loads the <launchVerb> page, the client-side
// JavaScript makes a socket.io connection to the game lobby with a socket.io
// namespace of this matchID.
Gorillas.prototype.connection = function(err, socket, session) {
  console.log('Gorillas: Connection from %s.', session.username);

  if (err) {
    // TODO: What kind of errors could occur here?
    throw err;
  }

  // Add the player. The socket will connect once the page has loaded.
  if (this.getPlayerByUsername(session.username) === null) {
    this.players.push({
      username: session.username,
      socket: socket,
      playerIdx: this.players.length,
      ready: false
    });
  } else {
    // TODO: Resume the game.
  }

  // Set up socket event handlers for this player.
  // TODO: The interface here could be better.
  for (var event in this.socketEventHandlers) {
    if (this.socketEventHandlers.hasOwnProperty(event)) {
      var eventHandler = this.socketEventHandlers[event];
      socket.on(event, eventHandler.bind(this, socket, session));
      console.log('gorillas game: Bound event %s for user %s.', event, session.username);
    }
  }
};

// Return the URL routes required by this game.
Gorillas.prototype.getRoutes = function() {
  return {'play': this.play};
};

// --------------------------------------------------
// Socket helper methods.

// Emit an event to all players.
Gorillas.prototype.emitAll = function (event, data) {
  for (var i = 0; i < this.players.length; i += 1) {
    var player = this.players[i];
    player.socket.emit(event, data);
  }
};

// --------------------------------------------------
// Socket event handlers.

// Player is ready to start the game.
Gorillas.prototype.ready = function (socket, session, eventData) {

  // TODO: Could possibly store a session.gorillas.playerIdx instead.
  var player = this.getPlayerByUsername(session.username);
  player.ready = true;
  console.log("%s is ready.", player.username);

  // Check whether everyone is ready.
  var playersReady = 0;
  for (var i = 0; i < this.players.length; i += 1) {
    if (this.players[i].ready === true) {
      playersReady += 1;
    }
  }

  if (playersReady === 2) {
    console.log("Both players are now ready.");
    this.start();
  }
};

// Player throws a banana.
Gorillas.prototype.throwBanana = function (socket, session, eventData) {
  var winResult;
  console.log('%s throwBanana.', session.username);
  console.log("currentPlayer = %d", this.currentPlayer());

  var player = this.getPlayerByUsername(session.username);

  if (player.playerIdx !== this.currentPlayer()) {
    console.log("The wrong player threw the banana!");
    return socket.emit('error', {msg: 'It is not your turn.'});
  }

  // TODO: Only need to emit to other player.
  this.players[this.otherPlayer()].socket.emit('bananaThrown', eventData);
  this.nextTurn();
};

// Player ends the round (their banana hit the opponent).
Gorillas.prototype.endRound = function (socket, session) {
  console.log('%s endRound.', session.username);
  console.log("currentPlayer = %d", this.currentPlayer());

  var player = this.getPlayerByUsername(session.username);

  // Perhaps unintuitively, it's the other player (the one that just threw the
  // banana) that ends the round and gets the point.
  if (player.playerIdx !== this.otherPlayer()) {
    console.log("The wrong player tried to end the round!");
    return socket.emit('error', {msg: 'It is not your turn.'});
  }

  this.wins[this.otherPlayer()] += 1;
  if (this.enoughWins(this.otherPlayer())) {
    console.log("Player %d has enough wins, the match is over.", this.otherPlayer());
    this.emitAll('matchEnded', {winner: this.otherPlayer()});
  } else {
    this.nextRound();
  }
};

// --------------------------------------------------
// Game play methods.

// Start the game.
Gorillas.prototype.start = function () {
  console.log('Gorillas start');


  // Send each player the game details in the start event.
  for (var i = 0; i < this.players.length; i += 1) {
    var player = this.players[i];

    player.socket.emit('matchStarted', {
      playerIdx: player.playerIdx,
      usernames: [this.players[0].username, this.players[1].username],
      returnURL: '/'
    });
  }

  this.nextRound();
};

Gorillas.prototype.currentPlayer = function() {
  return (this.turnNumber + this.startingPlayer) % 2;
};

Gorillas.prototype.otherPlayer = function() {
  return (this.turnNumber + this.startingPlayer + 1) % 2;
};

Gorillas.prototype.enoughWins = function(playerIdx) {
  if (this.wins[playerIdx] > this.maxRounds / 2) {
    return true;
  }

  return false;
};

Gorillas.prototype.nextTurn = function() {
  if (this.turnNumber === null) {
    this.turnNumber = 1;
  }

  this.turnNumber += 1;
};


// --------------------------------------------------
// Non-network methods.
Gorillas.prototype.generateBuildings = function() {
  var xPos = 0;
  var width,
    lastWidth,
    height,
    lastHeight;

  var buildings = [];

  while (xPos < this.mapWidth) {
    // Ensure no adjacent buildings have the same width or height.
    while (lastWidth === width || lastHeight === height) {
      width = this.randomIntBetween(6, 10);
      height = this.randomIntBetween(6, 28);
    }

    if (xPos + width > this.mapWidth) {
        width = this.mapWidth - xPos;
    }

    buildings.push ({
      x: xPos,
      width: width,
      height: height
    });

    xPos += width;
    lastWidth = width;
    lastHeight = height;
  }

  return buildings;
};

Gorillas.prototype.randomIntBetween = function(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

Gorillas.prototype.generateGorillaBuildings = function() {
  // Choose the start locations for the gorillas.
  var gorillaBuildings = [];
  gorillaBuildings[0] = this.randomIntBetween(1, 3);
  gorillaBuildings[1] = this.randomIntBetween(this.buildings.length - 4, this.buildings.length - 2);

  return gorillaBuildings;
};

Gorillas.prototype.nextRound = function() {
  this.startingPlayer = this.randomIntBetween(0, 1);
  this.turnNumber = null;

  this.buildings = this.generateBuildings();
  this.gorillaBuildings = this.generateGorillaBuildings();

  this.emitAll('roundStarted', {
    startingPlayer: this.startingPlayer,
    buildings: this.buildings,
    gorillaBuildings: this.gorillaBuildings
  });

  this.nextTurn();
  console.log("It is player %d's turn", this.currentPlayer());
};

module.exports = Gorillas;
