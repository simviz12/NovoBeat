import React, { useEffect, useRef, useState } from 'react';
import { 
  Play, Pause, SkipForward, SkipBack, 
  Volume2, Search, Disc, Radio, Sun, Moon, 
  Heart, UploadCloud, Home, Library, Plus, 
  FolderPlus, X, Shuffle, Repeat, Maximize2, 
  Music, Trash2, ListPlus, CheckCircle
} from 'lucide-react';
import { DoublyLinkedList, type Song, Node as DLLNode } from './structures/DoublyLinkedList';
import { get, set } from 'idb-keyval';
import { FastAverageColor } from 'fast-average-color';
import * as mm from 'music-metadata-browser';
import './App.css';

const fac = new FastAverageColor();

// Helpers
const formatTime = (s: number) => {
  if (isNaN(s) || s === Infinity) return "0:00";
  const m = Math.floor(s / 60);
  const sc = Math.floor(s % 60);
  return `${m}:${sc.toString().padStart(2, '0')}`;
};

const getCoverUrl = (cover: any): string => {
  if (!cover) return '';
  if (typeof cover === 'string') return cover;
  if (cover instanceof Blob) return URL.createObjectURL(cover);
  return '';
};

function App() {
  // UI State
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [view, setView] = useState<'home' | 'import' | 'library'>('home');
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showMsg, setShowMsg] = useState(false);
  const [query, setQuery] = useState('');

  // Music State
  const [songs, setSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<any[]>([{ id: 'favs', name: 'Favoritos', songIds: [] }]);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);

  // Playlist Management State
  const [showPlModal, setShowPlModal] = useState(false);
  const [targetSong, setTargetSong] = useState<Song | null>(null);
  const [newPlName, setNewPlName] = useState('');
  const [activePlId, setActivePlId] = useState<string | null>(null);

  // Refs
  const listRef = useRef<DoublyLinkedList<Song>>(new DoublyLinkedList<Song>());
  const currentNodeRef = useRef<DLLNode<Song> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const [beat, setBeat] = useState(1);

  // Load Data
  useEffect(() => {
    const init = async () => {
      const keys = ['symphony_master_songs', 'symphony_elite_v5_songs', 'symphony_master_songs_v2'];
      let list: any[] = [];
      for(const k of keys) { const data = await get(k); if(data?.length) { list = data; break; } }

      if (list.length > 0) {
        const dll = new DoublyLinkedList<Song>();
        const hydrated = list.filter(s => s.file).map(s => {
          const song = { ...s, objectUrl: URL.createObjectURL(s.file) };
          dll.append(song);
          return song;
        });
        listRef.current = dll;
        setSongs(hydrated);
        if(dll.head) {
          currentNodeRef.current = dll.head;
          setCurrentSong(dll.head.data);
          updateColor(getCoverUrl(dll.head.data.coverArt));
        }
      }
      const pls = await get('symphony_pls');
      if (pls) setPlaylists(pls);
    };
    init();
  }, []);

  // Save Data
  useEffect(() => {
    set('symphony_master_songs', songs.map(({objectUrl, ...r}) => r));
    set('symphony_pls', playlists);
  }, [songs, playlists]);

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);

  const updateColor = async (url?: string) => {
    if(!url) { document.documentElement.style.setProperty('--theme-dominant', '99, 102, 241'); return; }
    try {
      const c = await fac.getColorAsync(url);
      const [r,g,b] = c.value;
      document.documentElement.style.setProperty('--theme-dominant', `${r},${g},${b}`);
    } catch(e) {}
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      try {
        const meta = await mm.parseBlob(f);
        let cover = null;
        if(meta.common.picture?.[0]) {
          const pic = meta.common.picture[0];
          cover = new Blob([new Uint8Array(pic.data)], { type: pic.format });
        }
        const song: Song = {
          id: Math.random().toString(36).substring(2, 9),
          name: meta.common.title || f.name.replace(/\.[^/.]+$/, ""),
          artist: meta.common.artist || "Artista Desconocido",
          coverArt: cover, file: f, objectUrl: URL.createObjectURL(f),
          playCount: 0, addedAt: Date.now(), isFavorite: false
        };
        listRef.current.append(song);
      } catch (err) {
        console.error("Error importando archivo:", f.name, err);
      }
    }
    const arr = listRef.current.toArray();
    setSongs(arr);
    if(!currentNodeRef.current && arr.length > 0) {
      currentNodeRef.current = listRef.current.head;
      setCurrentSong(arr[0]);
    }
    setView('home');
    alert(`Se han importado ${files.length} archivos con éxito.`);
  };

  const playSong = async (song: Song) => {
    updateColor(getCoverUrl(song.coverArt));
    setCurrentSong(song);
    let node = listRef.current.head;
    while(node) {
      if(node.data.id === song.id) { currentNodeRef.current = node; break; }
      node = node.next;
    }
    if(audioRef.current) {
      audioRef.current.src = song.objectUrl;
      try { 
        await audioRef.current.play(); 
        setIsPlaying(true); 
        initAudioContext();
      } catch(e) { setIsPlaying(false); }
    }
  };

  const initAudioContext = () => {
    if (analyserRef.current || !audioRef.current) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      const src = ctx.createMediaElementSource(audioRef.current);
      const ana = ctx.createAnalyser();
      ana.fftSize = 256;
      src.connect(ana);
      ana.connect(ctx.destination);
      analyserRef.current = ana;
      animateBeat();
    } catch (e) { console.error("Web Audio fail:", e); }
  };

  const animateBeat = () => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    const render = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(data);
      // Analizar bajos (primeras frecuencias)
      const bass = data.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
      const scale = 1 + (bass / 255) * 0.15;
      const glow = (bass / 255) * 40;
      document.documentElement.style.setProperty('--beat-scale', scale.toString());
      document.documentElement.style.setProperty('--beat-glow', `${glow}px`);
      requestAnimationFrame(render);
    };
    render();
  };

  const handleNext = () => {
    if(!currentNodeRef.current) return;
    if(isShuffle) { playSong(songs[Math.floor(Math.random()*songs.length)]); }
    else if(currentNodeRef.current.next) { playSong(currentNodeRef.current.next.data); }
    else if(isRepeat && listRef.current.head) { playSong(listRef.current.head.data); }
    else { setIsPlaying(false); }
  };

  const handlePrev = () => {
    if(!currentNodeRef.current) return;
    if(audioRef.current && audioRef.current.currentTime > 3) { audioRef.current.currentTime = 0; return; }
    if(currentNodeRef.current.prev) playSong(currentNodeRef.current.prev.data);
  };

  const toggleFav = (e: React.MouseEvent, song: Song) => {
    e.stopPropagation();
    const up = songs.map(s => s.id === song.id ? {...s, isFavorite: !s.isFavorite} : s);
    setSongs(up);
    if(currentSong?.id === song.id) setCurrentSong({...currentSong, isFavorite: !currentSong.isFavorite});
  };

  const createPlaylist = () => {
    console.log("Intentando crear playlist con nombre:", newPlName);
    if(!newPlName.trim()) {
      alert("Por favor, escribe un nombre para la playlist.");
      return;
    }
    const newPl = { id: Math.random().toString(36).substring(2, 9), name: newPlName, songIds: [] };
    const updatedPlaylists = [...playlists, newPl];
    setPlaylists(updatedPlaylists);
    setNewPlName('');
    alert(`¡Playlist "${newPlName}" creada con éxito!`);
  };

  const addSongToPlaylist = (plId: string, songId: string) => {
    const updated = playlists.map(pl => {
      if(pl.id === plId && !pl.songIds.includes(songId)) {
        return { ...pl, songIds: [...pl.songIds, songId] };
      }
      return pl;
    });
    setPlaylists(updated);
    setTargetSong(null);
    setShowPlModal(false);
    alert("¡Canción añadida!");
  };

  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const removeSong = (e: React.MouseEvent, song: Song) => {
    e.stopPropagation();
    if (window.confirm(`¿Estás seguro de que quieres eliminar "${song.name}"?`)) {
      // Remove from state
      const updated = songs.filter(s => s.id !== song.id);
      setSongs(updated);
      
      // Remove from DLL
      let node = listRef.current.head;
      while (node) {
        if (node.data.id === song.id) {
          listRef.current.removeNode(node);
          break;
        }
        node = node.next;
      }
      
      // Stop playback if it's the current song
      if (currentSong?.id === song.id) {
        setCurrentSong(null);
        if (audioRef.current) {
          audioRef.current.pause();
          setIsPlaying(false);
        }
      }
    }
  };

  const filtered = (() => {
    let base = songs;
    if (activePlId) {
      const pl = playlists.find(p => p.id === activePlId);
      if (pl) base = songs.filter(s => pl.songIds.includes(s.id));
    } else if (favoritesOnly) {
      base = songs.filter(s => s.isFavorite);
    }
    return base.filter(s => 
      s.name.toLowerCase().includes(query.toLowerCase()) || 
      s.artist.toLowerCase().includes(query.toLowerCase())
    );
  })();

  return (
    <div className={`app-container ${showRightPanel ? 'has-panel' : ''}`}>
      <div className="ambient-bg"><div className="aura"></div></div>
      <audio 
        ref={audioRef}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onEnded={handleNext}
      />

      <aside className="sidebar">
        <div className="brand"><Radio size={28}/> Symphony</div>
        <nav style={{ display:'flex', flexDirection:'column', gap: 10 }}>
          <div className={`nav-item ${view==='home' && !favoritesOnly && !activePlId?'active':''}`} onClick={()=>{setView('home'); setFavoritesOnly(false); setActivePlId(null); setQuery('');}}><Home size={20}/> Inicio</div>
          <div className={`nav-item ${favoritesOnly?'active':''}`} onClick={()=>{setView('home'); setFavoritesOnly(true); setActivePlId(null); setQuery('');}}><Heart size={20} fill={favoritesOnly?'white':'none'}/> Favoritos</div>
          <div className={`nav-item ${view==='import'?'active':''}`} onClick={()=>{setView('import'); setFavoritesOnly(false); setActivePlId(null);}}><UploadCloud size={20}/> Importar</div>
          <div className={`nav-item ${view==='library'?'active':''}`} onClick={()=>{setView('library'); setFavoritesOnly(false); setActivePlId(null);}}><Library size={20}/> Biblioteca</div>
        </nav>
        <div style={{ flex:1 }}></div>
        {currentSong && (
          <div style={{ marginBottom: 20, display:'flex', gap: 12, alignItems:'center', background:'var(--border-light)', padding: 10, borderRadius: 15 }}>
            <img src={getCoverUrl(currentSong.coverArt)} style={{ width: 45, height: 45, borderRadius: 10, objectFit:'cover' }} alt=""/>
            <div style={{ overflow:'hidden' }}>
              <strong style={{ display:'block', fontSize:'0.85rem', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{currentSong.name}</strong>
              <span style={{ fontSize:'0.75rem', opacity:0.6 }}>{currentSong.artist}</span>
            </div>
          </div>
        )}
        <div className="nav-item" onClick={()=>setTheme(theme==='dark'?'light':'dark')}>
          {theme==='dark'?<Moon size={18}/>:<Sun size={18}/>} Modo {theme==='dark'?'Oscuro':'Claro'}
        </div>
      </aside>

      <main className="main-content">
        <header>
          <div className="search-input">
            <Search size={20} opacity={0.4}/>
            <input type="text" placeholder="¿Qué quieres escuchar hoy?" value={query} onChange={e=>setQuery(e.target.value)}/>
          </div>
        </header>

        <div className="view-content">
          {view === 'home' && (
            <>
              <h1 className="title-xl">{favoritesOnly ? 'Tus Canciones Favoritas' : 'Tu Colección'}</h1>
              <div className="grid-layout">
                {filtered.map(s => (
                  <div key={s.id} className="card-elite" onClick={()=>playSong(s)}>
                    <div className="card-art">
                      {s.coverArt ? <img src={getCoverUrl(s.coverArt)} alt=""/> : <div style={{height:'100%', display:'flex', alignItems:'center', justifyContent:'center', opacity:0.1}}><Music size={60}/></div>}
                      <button className="btn-p" style={{ position:'absolute', top:10, right:10, color: s.isFavorite?'#f43f5e':'white', opacity:1 }} onClick={(e)=>toggleFav(e, s)}>
                        <Heart size={20} fill={s.isFavorite?'currentColor':'none'}/>
                      </button>
                      <button className="btn-p" style={{ position:'absolute', top:10, left:40, color: 'white', opacity:0.8 }} onClick={(e)=>{e.stopPropagation(); setTargetSong(s); setShowPlModal(true);}}>
                        <ListPlus size={18}/>
                      </button>
                      <button className="btn-p" style={{ position:'absolute', top:10, left:10, color: 'white', opacity:0.6 }} onClick={(e)=>removeSong(e, s)}>
                        <Trash2 size={18}/>
                      </button>
                      <div className="play-badge"><Play size={24} fill="white"/></div>
                    </div>
                    <strong className="card-title">{s.name}</strong>
                    <span className="card-artist">{s.artist}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {view === 'import' && (
            <div style={{ height:'60vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <div style={{ textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap: 20 }}>
                <div style={{ width:120, height:120, background:'var(--primary-glow)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', color:'rgb(var(--primary))' }}><UploadCloud size={60}/></div>
                <h2 style={{fontSize:'2.5rem', fontWeight:900}}>Importar Música</h2>
                <p style={{color:'var(--text-muted)'}}>Sube tus archivos MP3 para empezar la experiencia Elite.</p>
                <button style={{ background:'rgb(var(--primary))', color:'white', border:'none', padding:'15px 40px', borderRadius: 12, fontWeight:700, cursor:'pointer' }} onClick={()=>document.getElementById('fup')?.click()}>Seleccionar Archivos</button>
                <input type="file" id="fup" multiple accept="audio/*" style={{display:'none'}} onChange={handleImport}/>
              </div>
            </div>
          )}

          {view === 'library' && (
            <div className="library-view">
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'2rem' }}>
                <h1 className="title-xl" style={{margin:0}}>
                  {activePlId ? `Playlist: ${playlists.find(p=>p.id===activePlId)?.name}` : 'Biblioteca Elite'}
                </h1>
                {!activePlId ? (
                  <div style={{ display:'flex', gap: 10 }}>
                    <input 
                      type="text" 
                      placeholder="Nombre de Playlist..." 
                      value={newPlName} 
                      onChange={e=>setNewPlName(e.target.value)}
                      style={{ background:'var(--border-light)', border:'none', borderRadius:10, padding:'0 15px', color:'var(--text-main)', fontSize:'0.9rem' }}
                    />
                    <button className="btn-p" style={{ background:'rgb(var(--primary))', padding:'10px 20px', borderRadius:10, fontWeight:700 }} onClick={createPlaylist}>
                      <Plus size={18} style={{marginRight:5}}/> Crear Playlist
                    </button>
                  </div>
                ) : (
                  <button className="btn-p" style={{ background:'var(--border-light)', padding:'10px 20px', borderRadius:10 }} onClick={()=>setActivePlId(null)}>
                    <SkipBack size={18} style={{marginRight:5}}/> Volver a Biblioteca
                  </button>
                )}
              </div>
              
              {!activePlId && (
                <div style={{ marginBottom: '3rem' }}>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1.5rem', opacity: 0.8 }}>Escuchas Recientes & Favoritos</h2>
                  <div className="grid-layout">
                    <div 
                      className={`card-elite ${favoritesOnly ? 'active-filter' : ''}`} 
                      style={{ background: favoritesOnly ? 'rgb(var(--primary))' : 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)', color: 'white' }}
                      onClick={() => { setFavoritesOnly(!favoritesOnly); setQuery(''); }}
                    >
                      <div className="card-art" style={{ background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Heart size={60} fill="white" />
                      </div>
                      <strong className="card-title">Tus Favoritos</strong>
                      <span className="card-artist" style={{ color: 'rgba(255,255,255,0.7)' }}>
                        {songs.filter(s => s.isFavorite).length} canciones
                      </span>
                    </div>

                    {/* Playlists creadas por el usuario */}
                    {playlists.filter(p => p.id !== 'favs').map(pl => (
                      <div key={pl.id} className="card-elite" style={{ background: 'var(--border-light)' }} onClick={()=>setActivePlId(pl.id)}>
                        <div className="card-art" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.2 }}>
                          <Music size={60} />
                        </div>
                        <strong className="card-title">{pl.name}</strong>
                        <span className="card-artist">{pl.songIds.length} canciones</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Lista de Canciones Filtrada (Por Biblioteca o Playlist activa) */}
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '1.5rem', opacity: 0.8 }}>
                {activePlId ? 'Canciones en esta lista' : 'Todas las pistas'}
              </h2>
              <div className="grid-layout">
                {filtered.map(s => (
                  <div key={s.id} className="card-elite" onClick={()=>playSong(s)}>
                    <div className="card-art">
                      {s.coverArt ? <img src={getCoverUrl(s.coverArt)} alt=""/> : <div style={{height:'100%', display:'flex', alignItems:'center', justifyContent:'center', opacity:0.1}}><Music size={60}/></div>}
                      <button className="btn-p" style={{ position:'absolute', top:10, right:10, color: s.isFavorite?'#f43f5e':'white', opacity:1 }} onClick={(e)=>toggleFav(e, s)}>
                        <Heart size={20} fill={s.isFavorite?'currentColor':'none'}/>
                      </button>
                      <button className="btn-p" style={{ position:'absolute', top:10, left:40, color: 'white', opacity:0.8 }} onClick={(e)=>{e.stopPropagation(); setTargetSong(s); setShowPlModal(true);}}>
                        <ListPlus size={18}/>
                      </button>
                      <button className="btn-p" style={{ position:'absolute', top:10, left:10, color: 'white', opacity:0.6 }} onClick={(e)=>removeSong(e, s)}>
                        <Trash2 size={18}/>
                      </button>
                      <div className="play-badge"><Play size={24} fill="white"/></div>
                    </div>
                    <strong className="card-title">{s.name}</strong>
                    <span className="card-artist">{s.artist}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {showRightPanel && currentSong && (
        <aside className="panel-right">
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom: 30 }}>
            <span style={{ fontSize:'0.75rem', fontWeight:800, opacity:0.5, letterSpacing:'0.1em' }}>REPRODUCIENDO</span>
            <X size={20} style={{cursor:'pointer'}} onClick={()=>setShowRightPanel(false)}/>
          </div>
          <div className="art-big" style={{ transform: 'scale(var(--beat-scale, 1))', boxShadow: '0 0 var(--beat-glow, 0px) rgba(var(--theme-dominant), 0.5)', transition: 'transform 0.05s linear' }}>
            {currentSong.coverArt ? <img src={getCoverUrl(currentSong.coverArt)} alt=""/> : <div style={{height:'100%', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--border-light)'}}><Disc size={120} opacity={0.1}/></div>}
          </div>
          <h2 style={{ fontSize:'1.8rem', fontWeight:900, marginBottom: 5 }}>{currentSong.name}</h2>
          <p style={{ fontSize:'1.2rem', color:'var(--text-muted)', fontWeight:500, marginBottom: 20 }}>{currentSong.artist}</p>
          
          <button 
            className="btn-p" 
            style={{ width:'100%', background:'var(--border-light)', padding:'15px', borderRadius:15, display:'flex', alignItems:'center', justifyContent:'center', gap:10, fontWeight:700 }}
            onClick={() => { setTargetSong(currentSong); setShowPlModal(true); }}
          >
            <ListPlus size={20}/> Añadir a Playlist
          </button>
        </aside>
      )}

      <footer className="footer-master">
        <div className="np-box">
          <div className="np-img">
            {currentSong?.coverArt ? <img src={getCoverUrl(currentSong.coverArt)} className={isPlaying?'spinning':''} alt=""/> : <Music size={24}/>}
          </div>
          <div className="np-info">
            <strong>{currentSong?.name || "Selecciona una pista"}</strong>
            <span style={{fontSize:'0.85rem', opacity:0.6}}>{currentSong?.artist || "Symphony Elite"}</span>
          </div>
        </div>

        <div className="player-core">
          <div className="ctrl-row">
            <Shuffle size={18} className={`btn-p ${isShuffle?'active':''}`} onClick={()=>setIsShuffle(!isShuffle)}/>
            <SkipBack size={24} className="btn-p" onClick={handlePrev}/>
            <div className="btn-p play-main" onClick={()=>{ if(audioRef.current?.paused) audioRef.current.play(); else audioRef.current?.pause(); setIsPlaying(!audioRef.current?.paused); }}>
              {isPlaying ? <Pause size={28} fill="currentColor"/> : <Play size={28} fill="currentColor" style={{marginLeft:3}}/>}
            </div>
            <button className="btn-p" style={{background:'none', border:'none'}} onClick={handleNext}><SkipForward size={24}/></button>
            <Repeat size={18} className={`btn-p ${isRepeat?'active':''}`} onClick={()=>setIsRepeat(!isRepeat)}/>
          </div>
          <div className="seek-wrap">
            <span>{formatTime(currentTime)}</span>
            <div className="bar-total" onClick={e => { if(!audioRef.current) return; const r=e.currentTarget.getBoundingClientRect(); audioRef.current.currentTime = ((e.clientX-r.left)/r.width)*duration; }}>
              <div className="bar-fill" style={{ width: `${(currentTime/duration)*100 || 0}%` }}></div>
            </div>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="actions-box">
          <Maximize2 className="btn-p" size={18} onClick={()=>setShowRightPanel(p=>!p)}/>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            <Volume2 size={20} opacity={0.5}/>
            <input type="range" min="0" max="1" step="0.01" value={volume} onChange={e => {setVolume(parseFloat(e.target.value)); if(audioRef.current) audioRef.current.volume=parseFloat(e.target.value);}} className="vol-control"/>
          </div>
        </div>
      </footer>

      {/* MODAL DE SELECCIÓN DE PLAYLIST */}
      {showPlModal && targetSong && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(10px)' }}>
          <div style={{ background:'var(--card-bg)', border:'1px solid var(--border-light)', padding:30, borderRadius:25, width:350, boxShadow:'0 25px 50px -12px rgba(0,0,0,0.5)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h3 style={{fontSize:'1.2rem', fontWeight:800}}>Añadir a Playlist</h3>
              <X size={24} style={{cursor:'pointer'}} onClick={()=>setShowPlModal(false)}/>
            </div>
            <p style={{fontSize:'0.9rem', opacity:0.6, marginBottom:20}}>Selecciona el destino para: <br/><strong>{targetSong.name}</strong></p>
            <div style={{ display:'flex', flexDirection:'column', gap:10, maxHeight:300, overflow:'auto' }}>
              {playlists.map(pl => (
                <div 
                  key={pl.id} 
                  onClick={()=>addSongToPlaylist(pl.id, targetSong.id)}
                  style={{ padding:15, background:'var(--border-light)', borderRadius:12, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between' }}
                >
                  <strong>{pl.name}</strong>
                  <div style={{fontSize:'0.8rem', opacity:0.5}}>{pl.songIds.length} pistas</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
