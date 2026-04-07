* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: #000;
  color: #fff;
  font-family: Arial, sans-serif;
  background: linear-gradient(135deg, #111 0%, #000 100%);
  min-height: 100vh;
}
#game-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}
h1 {
  color: #ffd700;
  text-align: center;
  margin-bottom: 30px;
  text-shadow: 0 0 10px #ffd700, 0 0 20px #ffd700;
}
.card {
  display: inline-block;
  width: 180px;
  height: 260px;
  border: 2px solid #ffd700;
  border-radius: 10px;
  margin: 10px;
  padding: 10px;
  background: rgba(0,0,0,0.8);
  text-align: center;
  box-shadow: 0 0 15px rgba(255, 215, 0, 0.3);
  transition: all 0.3s ease;
}
.card:hover {
  transform: scale(1.05);
  box-shadow: 0 0 25px rgba(255, 215, 0, 0.6);
}
.card img {
  width: 100%;
  height: 150px;
  object-fit: cover;
  border-radius: 5px;
  margin-bottom: 10px;
}
.card h3 {
  color: #ffd700;
  font-size: 16px;
  margin-bottom: 5px;
}
.card p {
  font-size: 12px;
  color: #ccc;
}
