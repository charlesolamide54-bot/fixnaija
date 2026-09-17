fetch("https://fixnaija-backend-w90o.onrender.com/api/reports")
    .then(response => response.json())
    .then(data => {
        console.log(data);
    });
