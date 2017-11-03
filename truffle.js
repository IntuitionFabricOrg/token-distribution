module.exports = {
  networks: {
    localhost: {
      host: "localhost", 
      port: 8545,
      network_id: "*" 
    },  
    ropsten: {
      host: "localhost",
      port: 8546,
      network_id: "3",
      gas: 4612388,
      gasPrice: 110000000000
    }
  },
  solc: {
      optimizer: {
	  enabled: false,
	  runs: 0
      }
  }
};
