import React, { useEffect } from 'react';
import '../Styles/Licitacija.css';

// Ne moramo da radimo socket.io-client jer dobijamo socket kao prop
// import io from "socket.io-client"; // NE
// import { useParams } from 'react-router-dom'; // NE mora
// import { useAuth } from '../Login/AuthContext'; // NE mora ako vec dobijamo user

const Licitacija = ({ socket, roundId, licitacija, user }) => {
  // Uzmi iz licitacija.minBid ako već server šalje
  // Ako ne, možeš da definišeš ručno
  const minBid = licitacija?.minBid || 5;
  const passedPlayers = licitacija?.passedPlayers || [];

  // Kreiramo listu mogućih bid-ova
  const options = [];
  // ubaci minimalne licitacije do 10
  for (let i = minBid; i <= 10; i++) {
    options.push(i.toString());
  }
  options.push('Meksiko');

  // Ako passedPlayers.length < 2 => možemo još reći "Dalje"
  // Ako su već dvoje rekli Dalje => treći ne može
  if (passedPlayers.length < 2) {
    options.push('Dalje');
  }

  const handleOptionClick = (option) => {
    socket.emit('playerBid', {
      roundId,    // ako je roundId isto što i gameId, prilagodite
      userId: user.id,
      bid: option
    });
  };

  // Slušamo samo ako treba
  useEffect(() => {
    // Ako želimo da reagujemo kada stigne nova licitacija (npr. zatvorimo overlay), možemo i ovde slušati:
    // socket.on('licitacijaUpdated', (data) => { ... });
    // return () => socket.off('licitacijaUpdated');
  }, [socket]);

  return (
    <div className="licitacija">
      <h2>Licitacija (tvoj potez!)</h2>
      <p>Minimalno: {minBid}</p>
      <div className="options">
        {options.map((option, index) => (
          <button
            key={index}
            className="option-button"
            onClick={() => handleOptionClick(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
};

export default Licitacija;