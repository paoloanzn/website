function updateClock() {
    const now = new Date();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const day = days[now.getUTCDay()];
    const date = now.getUTCDate();
    const month = months[now.getUTCMonth()];
    const year = now.getUTCFullYear();
    const hours = String(now.getUTCHours()).padStart(2, '0');
    const minutes = String(now.getUTCMinutes()).padStart(2, '0');
    const seconds = String(now.getUTCSeconds()).padStart(2, '0');

    document.getElementById('clock').textContent = `${day}, ${date} ${month} ${year} ${hours}:${minutes}:${seconds} +0000`;
}

updateClock();
setInterval(updateClock, 1000);
