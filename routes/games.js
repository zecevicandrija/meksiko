const express = require('express');
const router = express.Router();
const db = require('../db');

// Funkcija za generisanje špila od 32 karte (ako ti treba)
const generateDeck = () => {
  const suits = ['♠', '♥', '♦', '♣'];
  const values = ['A', 'K', 'Q', 'J', '10', '9', '8', '7'];
  const deck = [];

  for (const suit of suits) {
    for (const value of values) {
      deck.push({ suit, value });
    }
  }

  // Promešaj špil
  return deck.sort(() => Math.random() - 0.5);
};

// [1] Ruta za kreiranje ili pridruživanje igri
router.post('/', (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'UserId je obavezan' });
  }

  const findGameQuery = `
    SELECT g.id AS gameId, COUNT(gp.id) AS playerCount 
    FROM games g
    LEFT JOIN game_players gp ON g.id = gp.game_id
    WHERE g.status = 'waiting'
    GROUP BY g.id
    HAVING playerCount < 3
    LIMIT 1;
  `;

  db.query(findGameQuery, (err, results) => {
    if (err) {
      console.error('Greška prilikom pretrage igre:', err);
      return res.status(500).json({ error: 'Greška u bazi podataka.' });
    }

    // Postoji bar jedna igra koja čeka
    if (results.length > 0) {
      const gameId = results[0].gameId;
      const addPlayerQuery = 'INSERT INTO game_players (game_id, user_id, status) VALUES (?, ?, ?)';
      db.query(addPlayerQuery, [gameId, userId, 'joined'], (playerErr) => {
        if (playerErr) {
          console.error('Greška prilikom dodavanja igrača u igru:', playerErr);
          return res.status(500).json({ error: 'Greška u bazi podataka.' });
        }
        return res.status(200).json({ gameId });
      });
    } 
    // Nema takve igre -> kreiraj novu
    else {
      const createGameQuery = 'INSERT INTO games (created_by, status) VALUES (?, "waiting")';
      db.query(createGameQuery, [userId], (createErr, createResults) => {
        if (createErr) {
          console.error('Greška prilikom kreiranja igre:', createErr);
          return res.status(500).json({ error: 'Greška u bazi podataka.' });
        }

        const gameId = createResults.insertId;
        const addPlayerQuery = 'INSERT INTO game_players (game_id, user_id, status) VALUES (?, ?, ?)';
        db.query(addPlayerQuery, [gameId, userId, 'joined'], (playerErr) => {
          if (playerErr) {
            console.error('Greška prilikom dodavanja igrača:', playerErr);
            return res.status(500).json({ error: 'Greška u bazi podataka.' });
          }
          res.status(201).json({ gameId });
        });
      });
    }
  });
});

// [2] Ruta za deljenje karata
router.post('/deal-cards', (req, res) => {
  const { gameId } = req.body;

  if (!gameId) {
    return res.status(400).json({ error: 'GameId je obavezan' });
  }

  const deck = generateDeck();
  if (!deck || deck.length < 32) {
    console.error('Špil nije generisan ispravno.');
    return res.status(500).json({ error: 'Greška prilikom generisanja špila.' });
  }

  // U našem primeru: 3 igrača po 10 karata, + 2 talon karte
  const playerHands = [
    deck.slice(0, 10),
    deck.slice(10, 20),
    deck.slice(20, 30),
  ];
  const talon = deck.slice(30, 32);

  const getPlayersQuery = 'SELECT id, user_id FROM game_players WHERE game_id = ?';
  db.query(getPlayersQuery, [gameId], (err, players) => {
    if (err) {
      console.error('Greška prilikom dohvatanja igrača:', err);
      return res.status(500).json({ error: 'Greška u bazi podataka.' });
    }

    // Možda želiš da radiš i s 2 igrača. Ovo je samo primer.
    if (players.length < 3) {
      return res.status(400).json({ error: 'Nedovoljno igrača za deljenje karata.' });
    }

    // Upis ruku u bazu
    const queries = players.map((player, index) => {
      const hand = JSON.stringify(playerHands[index] || []);
      return new Promise((resolve, reject) => {
        const updateHandQuery = 'UPDATE game_players SET hand = ? WHERE id = ?';
        db.query(updateHandQuery, [hand, player.id], (updateErr) => {
          if (updateErr) reject(updateErr);
          else resolve();
        });
      });
    });

    Promise.all(queries)
      .then(() => {
        // Upis talona u bazu
        const updateGameQuery = 'UPDATE games SET talon_cards = ? WHERE id = ?';
        db.query(updateGameQuery, [JSON.stringify(talon), gameId], (updateErr) => {
          if (updateErr) {
            console.error('Greška prilikom ažuriranja talona:', updateErr);
            return res.status(500).json({ error: 'Greška u bazi podataka.' });
          }

          res.status(200).json({ message: 'Karte su podeljene.', talon });
        });
      })
      .catch((error) => {
        console.error('Greška prilikom dodeljivanja karata igračima:', error);
        res.status(500).json({ error: 'Greška u bazi podataka.' });
      });
  });
});

// [3] Ruta za dobijanje informacija o igri
router.get('/:gameId', (req, res) => {
  const { gameId } = req.params;

  const query = 'SELECT * FROM games WHERE id = ?';
  db.query(query, [gameId], (err, results) => {
    if (err) {
      console.error('Greška prilikom dohvatanja igre:', err);
      return res.status(500).json({ error: 'Greška u bazi podataka.' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Igra nije pronađena.' });
    }

    const game = results[0];
    res.status(200).json({
      id: game.id,
      createdBy: game.created_by,
      createdAt: game.created_at,
      status: game.status,
      talonCards: game.talon_cards ? JSON.parse(game.talon_cards) : [],
    });
    //console.log("Talon cards iz baze:", game.talon_cards);

  });
});

// [4] Ruta za dobijanje ruke igrača **po gameId i playerId**
// npr. GET /api/games/:gameId/player/:playerId/hand
router.get('/:gameId/player/:playerId/hand', (req, res) => {
  const { gameId, playerId } = req.params;

  const query = `
    SELECT hand 
    FROM game_players 
    WHERE game_id = ? 
      AND user_id = ? 
    LIMIT 1
  `;
  db.query(query, [gameId, playerId], (err, results) => {
    if (err) {
      console.error('Greška prilikom dohvatanja ruke igrača:', err);
      return res.status(500).json({ error: 'Greška u bazi podataka.' });
    }

    if (results.length === 0) {
      console.warn(`Ruka za igrača ${playerId} u igri ${gameId} nije pronađena.`);
      return res.status(404).json({ error: 'Ruka nije pronađena.' });
    }

    const hand = results[0].hand ? JSON.parse(results[0].hand) : [];
    console.log(`Ruka za igrača ${playerId} u igri ${gameId}:`, hand);
    res.status(200).json({ hand });
  });
});

module.exports = router;
