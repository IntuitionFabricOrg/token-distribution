module.exports = {
  networks: {
    development: {
      host: "localhost", 
      port: 8545,
      network_id: "*",
      gas: 4712388 
    },  
    ropsten: {
      host: "localhost",
      port: 8546,
      network_id: "3"
    }
  }
};
