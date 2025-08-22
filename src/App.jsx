import React, { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ethers } from "ethers";

import {
  Wallet, Link2, Shuffle, Upload, FileUp, Copy,
  ListChecks, CheckCircle2, AlertTriangle, Hash, HashIcon, Loader2, ExternalLink
} from "lucide-react";
import { Trophy } from "lucide-react";
// ícone de troféu

/**
 * App.jsx — UI/UX refinada (web3 clean + glass)
 * -> usa classes de raffle.css: app, shell, grid-12, card, input, textarea, btn, btn-primary, btn-neutral, code, badge, winner
 */

const CONTRACT_ADDRESS_DEFAULT = "0x660eBb941839c63D76115D5246FdcAA20C786fE6";
const MONAD_CHAIN_ID_HEX = "0x279f"; // 10143
const MONAD_PARAMS = {
  chainId: MONAD_CHAIN_ID_HEX,
  chainName: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: ["https://testnet-rpc.monad.xyz"],
  blockExplorerUrls: ["https://testnet.monadexplorer.com"],
};

const RAFFLE_ABI = [
  "function nextId() view returns (uint256)",
  "function createRaffle(string name, uint32 numWinners, bytes32 participantsHash, string participantsURI, bytes32 secretCommitment) returns (uint256 id)",
  "function draw(uint256 id, string secret, address[] participants)",
  "function getWinners(uint256 id) view returns (address[])",
  "event RaffleCreated(uint256 indexed id, address indexed organizer, string name, uint32 numWinners, bytes32 participantsHash, string participantsURI, bytes32 secretCommitment, uint64 targetChainId, uint64 createdAt)",
  "event WinnersDrawn(uint256 indexed id, bytes32 randomness, address[] winners)"
];

function normalizeAddressesFromText(text) {
  const lines = text.split(/\r?\n|,|;|\s+/).map(x=>x.trim()).filter(Boolean);
  const uniq = Array.from(new Set(lines));
  return uniq.map(ethers.getAddress);
}

function randomSecret() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b).map(x=>x.toString(16).padStart(2,"0")).join("");
}

export default function App() {
  const [contractAddr, setContractAddr] = useState(CONTRACT_ADDRESS_DEFAULT);
  const [chainIdHex, setChainIdHex] = useState(MONAD_CHAIN_ID_HEX);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");
  const [contract, setContract] = useState(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("Sorteio");
  const [numWinners, setNumWinners] = useState(1);
  const [participantsText, setParticipantsText] = useState("");
  const [participantsURI, setParticipantsURI] = useState("");
  const [secret, setSecret] = useState(() => randomSecret());
  const [raffleId, setRaffleId] = useState("");
  const [status, setStatus] = useState("");
  const [txHash, setTxHash] = useState("");
  const [winners, setWinners] = useState([]);
  const fileRef = useRef(null);
  const [lookupId, setLookupId] = useState("");
  const [lookupWinners, setLookupWinners] = useState([]);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupMsg, setLookupMsg] = useState("");


  const addresses = useMemo(()=>{
    try { return participantsText ? normalizeAddressesFromText(participantsText) : []; }
    catch { return null; }
  }, [participantsText]);

  const participantsHash = useMemo(()=>{
    try {
      if (!addresses || addresses.length===0) return null;
      return ethers.solidityPackedKeccak256(["address[]"], [addresses]);
    } catch { return null; }
  }, [addresses]);

  const secretCommitment = useMemo(()=> secret ? ethers.keccak256(ethers.toUtf8Bytes(secret)) : null, [secret]);

  async function addOrSwitchMonad() {
    if (!window.ethereum) { setStatus("Wallet não encontrada"); return; }
    try {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: MONAD_CHAIN_ID_HEX }] });
    } catch (e) {
      if (e?.code === 4902 || /Unrecognized chain ID/i.test(e?.message||"")) {
        await window.ethereum.request({ method: "wallet_addEthereumChain", params: [ MONAD_PARAMS ] });
      } else { throw e; }
    }
  }

  async function connect() {
    try {
      setBusy(true); setStatus("Conectando carteira…");
      await addOrSwitchMonad();
      const prov = new ethers.BrowserProvider(window.ethereum);
      const sign = await prov.getSigner();
      const acc = await sign.getAddress();
      setProvider(prov); setSigner(sign); setAccount(acc);
      setContract(new ethers.Contract(contractAddr, RAFFLE_ABI, sign));
      setStatus("Carteira conectada");
    } catch (e) { setStatus("Falha ao conectar: "+(e?.shortMessage||e?.message||e)); }
    finally { setBusy(false); }
  }

  function onFile(e){
    const f = e.target.files?.[0]; if(!f) return;
    const r = new FileReader(); r.onload = () => setParticipantsText(String(r.result||"")); r.readAsText(f);
  }

  async function onCreate(){
    try {
      if (!signer) throw new Error("Conecte a carteira");
      if (!contractAddr) throw new Error("Informe o endereço do contrato");
      if (!addresses || addresses.length===0) throw new Error("Informe a lista de carteiras (textarea ou CSV)");
      if (!participantsHash) throw new Error("Falha ao calcular participantsHash");
      setBusy(true); setStatus("Enviando tx de criação…");
      const c = contract ?? new ethers.Contract(contractAddr, RAFFLE_ABI, signer);
      const tx = await c.createRaffle(name.trim(), Number(numWinners), participantsHash, participantsURI.trim(), secretCommitment);
      const rc = await tx.wait(); setTxHash(rc.hash);

      // tentar extrair o ID do evento; se não vier, tenta nextId()-1
      let id = "";
      for (const log of rc.logs) {
        try {
          const p = c.interface.parseLog(log);
          if (p?.name === "RaffleCreated") { id = p.args?.id?.toString(); break; }
        } catch {}
      }
      if (!id) {
        try { const nx = await c.nextId(); id = (BigInt(nx) - 1n).toString(); } catch {}
      }
      setRaffleId(id);
      setStatus(`Sorteio criado${id?` (ID ${id})`:''}`);
    } catch(e){ setStatus("Erro ao criar: "+(e?.shortMessage||e?.message||e)); }
    finally { setBusy(false); }
  }
async function onLookup() {
  try {
    if (!contract) throw new Error("Conecte a carteira/contrato primeiro.");
    const idNum = Number(lookupId);
    if (!Number.isFinite(idNum)) throw new Error("ID inválido.");
    setLookupBusy(true);
    setLookupMsg("Buscando vencedores…");
    const w = await contract.getWinners(idNum);
    setLookupWinners(w);
    setLookupMsg(w.length ? `Encontrados ${w.length} vencedor(es).` : "Nenhum vencedor registrado ainda para este ID.");
  } catch (e) {
    setLookupWinners([]);
    setLookupMsg(e?.shortMessage || e?.message || String(e));
  } finally {
    setLookupBusy(false);
  }
}

  async function onDraw(){
    try {
      if (!signer) throw new Error("Conecte a carteira");
      const idNum = Number(raffleId); if(!Number.isFinite(idNum)) throw new Error("Informe o Raffle ID");
      if (!addresses || addresses.length===0) throw new Error("Informe a lista de carteiras");
      if (!secret) throw new Error("Informe o secret (reveal)");
      setBusy(true); setStatus("Sorteando on-chain…");
      const c = contract ?? new ethers.Contract(contractAddr, RAFFLE_ABI, signer);
      const tx = await c.draw(idNum, secret, addresses);
      const rc = await tx.wait(); setTxHash(rc.hash);
      const w = await c.getWinners(idNum); setWinners(w);
      setStatus(`Sorteio concluído com ${w.length} vencedores.`);
    } catch(e){ setStatus("Erro ao sortear: "+(e?.shortMessage||e?.message||e)); }
    finally { setBusy(false); }
  }

  function copy(v){ navigator.clipboard?.writeText(v||""); setStatus("Copiado!"); }

  const explorerTx = txHash ? `https://monad-testnet.socialscan.io/tx/${txHash}` : "";
  function csvEscape(v) {
    if (v === null || v === undefined) return "";
    const s = String(v);
    // envolve em aspas e duplica aspas internas
    return `"${s.replace(/"/g, '""')}"`;
  }

  function exportWinnersCSV() {
    if (!winners || winners.length === 0) return;
    const header = ["position","address","raffleId","name"].join(",") + "\n";
    const lines = winners
      .map((addr, i) => [i + 1, addr, raffleId || "", name || ""].map(csvEscape).join(","))
      .join("\n");
    const csv = header + lines;

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `winners_${raffleId || "unknown"}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus("CSV gerado!");
  }

  return (
  <div className="app">
    <div className="shell">
      {/* HERO */}
      <motion.div className="hero" initial={{opacity:0, y:-8}} animate={{opacity:1, y:0}}>
        <h1 className="headline">On-chain giveaways</h1>
        <p>Create and run on-chain, multi-winner giveaway with full transparency.</p>
      </motion.div>

      {/* TOP: 3 CARDS */}
      <div className="grid-12">
        {/* Config */}
        <div className="card" style={{gridColumn:"span 12 / span 12"}}>
          <h3 className="card-title">Configuration</h3>
          <div className="grid-12">
            <div style={{ gridColumn: "span 12 / span 12" }}>
              <label>Contract address</label>
              <input
                className="input"
                value={contractAddr}
                readOnly
                placeholder="0x…"
              />
            </div>

            <div style={{gridColumn:"span 12 / span 12", marginTop:12, display:"flex", gap:8}}>
              <button onClick={addOrSwitchMonad} className="btn btn-neutral">
                <Link2 className="icon-4" /> Add/Switch Monad
              </button>
              <button onClick={connect} disabled={busy} className="btn btn-primary">
                {busy ? <Loader2 className="icon-4" style={{animation:"spin .8s linear infinite"}}/> : <Wallet className="icon-4" />}
                Connect
              </button>
            </div>

            {account && (
              <div style={{gridColumn:"span 12 / span 12", marginTop:12}} className="card-sub">
                <CheckCircle2 className="icon-4" style={{color:"#10b981", marginRight:6}}/>
                {account}
              </div>
            )}
          </div>
        </div>

        {/* Hashes */}
        <div className="card" style={{gridColumn:"span 12 / span 12"}}>
          <h3 className="card-title">Integrity</h3>
          <label>participantsHash</label>
          <div className="code mono">{participantsHash || "—"}</div>
          <label style={{marginTop:8}}>secretCommitment</label>
          <div className="code mono">{secretCommitment || "—"}</div>
          {txHash && (
            <div className="card-sub mono" style={{marginTop:8}}>
              tx: {txHash}{" "}
              {explorerTx && (
                <a className="link" href={explorerTx} target="_blank" rel="noreferrer">
                  (view on explorer <ExternalLink className="icon-4" />)
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* CREATE RAFFLE */}
      <div className="card" style={{marginTop:16}}>
        <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:8}}>
          <Upload className="icon-4" style={{color:"#6366F1"}}/>
          <h2 className="card-title" style={{margin:0}}>Create giveaway</h2>
        </div>

        <div className="grid-12">
          <div style={{gridColumn:"span 12 / span 12"}}>
            <label>Event name</label>
            <input className="input" value={name} onChange={e=>setName(e.target.value)} />
          </div>

          <div style={{gridColumn:"span 12 / span 12", marginTop:12}}>
            <label>Number of winners</label>
            <input className="input" type="number" min={1} value={numWinners} onChange={e=>setNumWinners(Number(e.target.value))} />
          </div>

          <div style={{gridColumn:"span 12 / span 12", marginTop:12}}>
            <label>Participants (one wallet per line) or CSV/TXT</label>
            <textarea className="textarea" value={participantsText} onChange={e=>setParticipantsText(e.target.value)} placeholder={"0xabc...\n0xdef..."} />
            <div style={{display:"flex", gap:8, marginTop:8, alignItems:"center"}}>
              <input ref={fileRef} type="file" accept=".csv,.txt" onChange={onFile} className="hidden" />
              <button onClick={()=>fileRef.current?.click()} className="btn btn-neutral"><FileUp className="icon-4" /> Upload file</button>
              <span className="card-sub">Unique addresses: {Array.isArray(addresses)?addresses.length:0}</span>
            </div>
          </div>
        </div>

        <div style={{display:"flex", flexWrap:"wrap", gap:12, marginTop:14, alignItems:"center"}}>
          <button onClick={onCreate} disabled={busy} className="btn btn-primary">
            {busy ? <Loader2 className="icon-4" style={{animation:"spin .8s linear infinite"}}/> : <Upload className="icon-4" />}
            Create giveaway
          </button>
        </div>
      </div>

      {/* DRAW WINNERS */}
<div className="card" style={{ marginTop: 16 }}>
  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
    <Shuffle className="icon-4" style={{ color: "#6366F1" }} />
    <h2 className="card-title" style={{ margin: 0 }}>Draw winners</h2>
  </div>

  {/* toolbar: ID + Draw (esquerda) | Export CSV (direita) */}
  <div className="draw-toolbar">
    <div className="draw-left">
      <div className="field-inline">
        <label>giveaway ID</label>
        <input
          className="input input-id"
          value={raffleId}
          onChange={(e) => setRaffleId(e.target.value)}
          placeholder="ex.: 5"
        />
      </div>

      <button onClick={onDraw} disabled={busy} className="btn btn-neutral">
        {busy ? (
          <Loader2 className="icon-4" style={{ animation: "spin .8s linear infinite" }} />
        ) : (
          <Shuffle className="icon-4" />
        )}
        Draw on-chain
      </button>
    </div>

    <div className="draw-right">
      <button
        onClick={exportWinnersCSV}
        className="btn btn-primary"
        disabled={!winners || winners.length === 0}
        title={(!winners || winners.length === 0) ? "Faça o sorteio para exportar" : "Exportar CSV dos vencedores"}
      >
        Export CSV
      </button>
    </div>
  </div>

  {winners?.length > 0 && (
    <div style={{ marginTop: 16 }}>
      <div className="card-sub" style={{ fontWeight: 700 }}>Winners</div>
      <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
        {winners.map((w, i) => (
          <div key={w + String(i)} className="winner" style={{ width: 'fit-content' }}>
            <Trophy className="icon-4" style={{ color: "#FACC15" }} />
            <span className="mono">{w}</span>
            <button onClick={() => copy(w)} className="btn">copy</button>
          </div>
        ))}
      </div>
    </div>
  )}
</div>


      {/* LOOKUP RAFFLE BY ID */}
      <div className="card" style={{marginTop:16}}>
        <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:8}}>
          <h2 className="card-title" style={{margin:0}}>Lookup giveaway</h2>
        </div>

        <div className="grid-12">
          <div style={{gridColumn:"span 12 / span 12"}}>
            <label>Giveaway ID</label>
            <input
              className="input"
              value={lookupId}
              onChange={(e)=>setLookupId(e.target.value)}
              onKeyDown={(e)=> e.key==='Enter' && onLookup()}
              placeholder="e.g., 0, 1, 2…"
            />
          </div>
        </div>

        <div style={{marginTop:12, display:'flex', gap:8, alignItems:'center'}}>
          <button onClick={onLookup} disabled={lookupBusy} className="btn btn-primary">
            {lookupBusy ? "Fetching..." : "Get winners"}
          </button>
          {lookupMsg && <div className="status">{lookupMsg}</div>}
        </div>

        {lookupWinners.length > 0 && (
          <div style={{marginTop:16}}>
            <div className="card-sub" style={{fontWeight:700}}>Winners</div>
            <div style={{marginTop:8, display:'grid', gap:8}}>
              {lookupWinners.map((w,i)=>(
                <div key={w+String(i)} className="winner" style={{width:'fit-content'}}>
                  <Trophy className="icon-4" style={{color:"#FACC15"}}/>
                  <span className="mono">{w}</span>
                  <button className="btn" onClick={()=>navigator.clipboard?.writeText(w)}>copy</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div style={{marginTop:18, textAlign:"center"}}>
        <span className="card-sub">
          <ListChecks className="icon-4" style={{marginRight:6}}/>
        </span>
      </div>
    </div>
  </div>
);

}