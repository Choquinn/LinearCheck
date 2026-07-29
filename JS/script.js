document.getElementById('form').addEventListener('submit', function(e) {
  e.preventDefault();
  
  const inputValue = document.getElementById('name-block').value;
  localStorage.setItem('name', inputValue);
  
  window.location.href = '../calculation.html';
});