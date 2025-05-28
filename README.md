# Bitcoin Rune Dex Backend

A TypeScript-based implementation of a decentralized exchange (DEX) for Bitcoin Rune tokens. This project provides essential DeFi features like swapping, AMM (Automated Market Making), liquidity provision, and yield farming, all built on the Bitcoin network using the Rune protocol.

## Core Features

### Token Operations

- 🔄 Advanced Token Swapping with Multi-hop Routing
- 💧 Liquidity Pool Management
- 🌾 Yield Farming
- 📊 Real-time Price Feeds
- ⚙️ Automated Market Making (AMM)
- ⛽ Gas-optimized Operations
- 📬 Multi-token Distribution System

### DeFi Functionality

- 💱 Direct Token Swaps with Price Impact Calculation
- 🛡️ Slippage Protection
- 💰 Fee Collection and Distribution
- 📈 APY Calculation and Tracking
- 🏊‍♂️ Pool Creation and Management
- 🎯 Impermanent Loss Protection

## Prerequisites

- Node.js (v14 or higher)
- MongoDB
- TypeScript
- Web3 Provider (e.g., Mempool)
- Compatible Wallets:
  - Unisat
  - XVerse
  - Phantom
  - MagicEden
  - OKX

## Technical Architecture

### Token Swapping System

- Multi-hop routing for optimal swap paths
- Price impact calculation engine
- Slippage protection mechanisms
- UTXO management system

### Liquidity Pool Management

- Pool creation and initialization
- Liquidity provision tracking
- Fee collection and distribution
- Emergency stop mechanisms

### Yield Farming

- Farm creation and management
- Automated reward distribution
- Staking mechanism implementation
- Real-time APY calculations

## Critical Issues & Solutions

### 1. UTXO Management

**Problem**: Users face difficulties with spent UTXO tokens during swaps

**Solutions**:

1. UTXO Splitting Strategy
   - Split tokens into multiple UTXOs
   - Pros: Avoids UTXO spent problems
   - Cons: Higher transaction fees
2. Spent UTXO Reference System
   - Enables usage of spent UTXOs
   - Limited to 24 swaps per block
   - More cost-effective solution

### 2. Multi-User Token Distribution

**Problem**: OP_RETURN size limits multi-user token distribution

**Solution**: Recursive Distribution Algorithm

- Maximum 9 users per transaction (OP_RETURN size limit)
- Implements recursive algorithm for larger distributions
- Integrates with spent UTXO reference system
- Optimized for gas efficiency
  
![image](https://github.com/user-attachments/assets/2c759c06-abbb-4347-9202-d2a4aa2eb641)

### 3. High Concurrency Management

**Problem**: System struggles with high-volume requests (100+ per second)

**Solution**: LavinMQ Implementation

- Queue-based request handling
- Sequential processing
- Improved system stability
- Better resource management

## Security Features

### Transaction Security

- Price oracle integration
- Flash loan attack protection
- Reentrancy guards
- Rate limiting

### Pool Security

- Liquidity locks
- Emergency circuit breakers
- Role-based access control
- Real-time monitoring

## Monitoring & Analytics

### Pool Metrics

- Real-time liquidity tracking
- Price monitoring
- Volume analysis
- Fee collection statistics

### Performance Tracking

- APY calculations
- User activity metrics
- Gas optimization analysis
- Error monitoring and logging

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Environment Configuration

Create a `.env` file:

```env
PORT=6000
MONGO_URI=your_mongodb_connection_string
MEMPOOL_API_KEY=your_mempool_api_key
MAX_REQUESTS_PER_SECOND=100
LAVINMQ_URL=your_lavinmq_url
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
