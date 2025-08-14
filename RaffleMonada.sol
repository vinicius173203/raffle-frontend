// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title RaffleMonada — Sorteio transparente on-chain (Monad testnet), multi-vencedores, sem custódia
/// @author Você
/// @notice Este contrato NÃO segura prêmios. Ele apenas registra: evento, participantes (por hash/URI),
///         sorteio on-chain com commit-reveal e vencedores persistidos on-chain. Transparência total via eventos.
/// @dev Pensado para testnet da Monad. Para produção, considere VRF. Limites de participantes para caber no gas.
contract RaffleMonada {
    // Limites amigáveis de gas (ajuste conforme necessário/testado)
    uint256 public constant MAX_PARTICIPANTS = 2000; // seguro para testnet; evite listas gigantes

    struct Raffle {
        address organizer;
        string  name;                // Ex.: "Sorteio 50 MON"
        uint64  createdAt;
        uint32  numWinners;          // quantidade de vencedores a sortear
        bytes32 participantsHash;    // keccak256(abi.encodePacked(address1, address2, ...)) — ordem importa
        string  participantsURI;     // IPFS/HTTPS do CSV/JSON da lista publicada
        bytes32 secretCommitment;    // keccak256(abi.encodePacked(secret)) — anti-manipulação
        bool    drawn;               // já sorteado?
        bytes32 randomness;          // semente usada (para reprodutibilidade)
        address[] winners;           // vencedores persistidos on-chain
        uint64  targetChainId;       // chainId do ambiente onde foi criado (deve ser a Monad testnet aqui)
    }

    uint256 public nextId;
    mapping(uint256 => Raffle) public raffles;

    event RaffleCreated(
        uint256 indexed id,
        address indexed organizer,
        string name,
        uint32 numWinners,
        bytes32 participantsHash,
        string participantsURI,
        bytes32 secretCommitment,
        uint64 targetChainId,
        uint64 createdAt
    );

    event WinnersDrawn(
        uint256 indexed id,
        bytes32 randomness,
        address[] winners
    );

    modifier onlyOrganizer(uint256 id) {
        require(raffles[id].organizer == msg.sender, "not organizer");
        _;
    }

    /// @notice Cria um sorteio registrando o nome, #vencedores, hash/URI da lista e compromisso do segredo.
    /// @param name Nome do evento (ex.: "50 MON - Agosto").
    /// @param numWinners Quantidade de vencedores.
    /// @param participantsHash keccak256 concatenando os enderecos em ordem (veja helper off-chain).
    /// @param participantsURI Link publico (IPFS/HTTPS) para a lista publicada.
    /// @param secretCommitment keccak256(abi.encodePacked(secret)).
    function createRaffle(
        string calldata name,
        uint32 numWinners,
        bytes32 participantsHash,
        string calldata participantsURI,
        bytes32 secretCommitment
    ) external returns (uint256 id) {
        require(numWinners > 0, "numWinners=0");
        id = nextId++;
        Raffle storage r = raffles[id];
        r.organizer = msg.sender;
        r.name = name;
        r.numWinners = numWinners;
        r.participantsHash = participantsHash;
        r.participantsURI = participantsURI;
        r.secretCommitment = secretCommitment;
        r.createdAt = uint64(block.timestamp);
        r.targetChainId = uint64(block.chainid);
        emit RaffleCreated(id, msg.sender, name, numWinners, participantsHash, participantsURI, secretCommitment, r.targetChainId, r.createdAt);
    }

    /// @notice Realiza o sorteio e grava os vencedores on-chain.
    /// @dev Transparente: passa a lista completa; o contrato valida o hash e o compromisso do segredo.
    /// @param id ID do sorteio.
    /// @param secret O segredo original cujo hash == secretCommitment.
    /// @param participants Lista completa de enderecos participantes (mesma ordem usada no hash).
    function draw(
        uint256 id,
        string calldata secret,
        address[] calldata participants
    ) external onlyOrganizer(id) {
        Raffle storage r = raffles[id];
        require(!r.drawn, "already drawn");
        uint256 n = participants.length;
        require(n >= r.numWinners && n > 0, "invalid participants count");
        require(n <= MAX_PARTICIPANTS, "too many participants");
        // Verifica integridade da lista: hash deve bater exatamente (ordem inclusa)
        bytes32 computed = keccak256(abi.encodePacked(participants));
        require(computed == r.participantsHash, "participantsHash mismatch");
        // Verifica compromisso do segredo
        require(keccak256(abi.encodePacked(secret)) == r.secretCommitment, "bad secret reveal");

        // Semente de aleatoriedade: commit-reveal + blockhash anterior + address(this) + id + n
        // Observacao: suficiente para testnet; para mainnet/valor alto, use VRF.
        bytes32 seed = keccak256(
            abi.encodePacked(secret, blockhash(block.number - 1), address(this), id, n)
        );

        // Copia participantes para memoria para fazermos um partial Fisher-Yates
        address[] memory pool = new address[](n);
        for (uint256 i = 0; i < n; i++) {
            pool[i] = participants[i];
        }

        address[] memory winnersMem = new address[](r.numWinners);
        for (uint256 i = 0; i < r.numWinners; i++) {
            // pseudo-rand index em [i, n)
            seed = keccak256(abi.encodePacked(seed, i));
            uint256 j = i + (uint256(seed) % (n - i));
            // swap pool[i] <-> pool[j]
            (pool[i], pool[j]) = (pool[j], pool[i]);
            winnersMem[i] = pool[i];
            r.winners.push(pool[i]);
        }

        r.drawn = true;
        r.randomness = seed; // guarda ultima semente usada
        emit WinnersDrawn(id, seed, winnersMem);
    }

    /// @notice Retorna vencedores do sorteio.
    function getWinners(uint256 id) external view returns (address[] memory) {
        return raffles[id].winners;
    }
}
