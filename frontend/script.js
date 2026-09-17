fetch("http://localhost:5000/api/reports")
    .then(response => response.json())
    .then(data => {
        console.log(data);
    });
