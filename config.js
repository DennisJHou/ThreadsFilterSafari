console.log("Script: config.js loaded!")

let Globals = {
    alive_interval: 10000,
    user_id: null,
    user_ip: null,
    user_agent:  navigator.userAgent,
    server_url: "https://mil.psy.ntu.edu.tw"
}

//fetch("https://api.ipify.org?format=json")
//  .then(res => res.json())
//  .then(data => {Globals.user_ip=data.ip})
//  .catch(err => console.error("Failed to get IP:", err));
