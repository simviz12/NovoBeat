import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { 
  Play, Pause, SkipForward, SkipBack, Trash2, 
  Volume2, VolumeX, Repeat, Repeat1, Search, Gauge, Disc, Network, Plus, Radio, ArrowRightLeft, Sun, Moon, Waves, Rocket, BookOpen
} from 'lucide-react';
import { DoublyLinkedList, type Song, Node as DLLNode } from './structures/DoublyLinkedList';
import { FastAverageColor } from 'fast-average-color';
// @ts-ignore
import jsmediatags from 'jsmediatags/dist/jsmediatags.min.js';
import { get, set } from 'idb-keyval';
import './App.css';

const fac = new FastAverageColor();

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
}

function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playlistArray, setPlaylistArray] = useState<Song[]>([]);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [pannerValue, setPannerValue] = useState(0);
  const [stadiumMode, setStadiumMode] = useState(false);
  const [underwaterMode, setUnderwaterMode] = useState(false);
  const [nightcoreMode, setNightcoreMode] = useState(false);

  const [loopMode, setLoopMode] = useState<'none'|'one'|'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [insertMode, setInsertMode] = useState<'end'|'start'|'index'>('end');
  const [insertIndex, setInsertIndex] = useState(0);

  const listRef = useRef<DoublyLinkedList<Song>>(new DoublyLinkedList<Song>());
  const currentNodeRef = useRef<DLLNode<Song> | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  
  const pannerNodeRef = useRef<StereoPannerNode | null>(null);
  const echoGainRef = useRef<GainNode | null>(null);
  const lowpassFilterRef = useRef<BiquadFilterNode | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null); 
  const animationRef = useRef<number | null>(null);
  const isDbLoadedRef = useRef(false);

  const dominantRgbRef = useRef('99, 102, 241');
  const particlesRef = useRef<Particle[]>([]);

  const filteredPlaylist = useMemo(() => {
    if (!searchQuery) return playlistArray;
    const lowerQ = searchQuery.toLowerCase();
    return playlistArray.filter(s => s.name.toLowerCase().includes(lowerQ) || s.artist.toLowerCase().includes(lowerQ));
  }, [playlistArray, searchQuery]);

  // INITIAL LOAD FROM BROWSER PERSISTENT DB
  useEffect(() => {
    if (isDbLoadedRef.current) return; // Prevent StrictMode immediate double invocation
    isDbLoadedRef.current = true; // Lock immediately synchronously

    const loadDB = async () => {
      try {
        const saved = await get('novobeat_playlist');
        if (saved && Array.isArray(saved) && saved.length > 0) {
          
          listRef.current = new DoublyLinkedList<Song>(); // Wipe any potential RAM bugs
          const seenIds = new Set(); // Duplication defensive filter

          for (const item of saved) {
             if (!item.file) continue;
             if (seenIds.has(item.id)) continue; // Destroy duplication anomalies from DB
             seenIds.add(item.id);

             const url = URL.createObjectURL(item.file);
             const restoredSong: Song = {
               id: item.id,
               name: item.name,
               artist: item.artist,
               coverArt: item.coverArt,
               file: item.file,
               objectUrl: url,
               playCount: item.playCount || 0,
               addedAt: item.addedAt || Date.now(),
               note: item.note || ''
             };
             // Rebuild local RAM structure from persisted storage
             listRef.current.append(restoredSong);
          }
          setPlaylistArray(listRef.current.toArray());
          if (listRef.current.head) {
             currentNodeRef.current = listRef.current.head;
             setCurrentSong(listRef.current.head.data);
             updateThemeWithArt(listRef.current.head.data.coverArt);
             if (audioRef.current) audioRef.current.src = listRef.current.head.data.objectUrl;
          }
        }
      } catch (err) {
        console.error("Fallo al recuperar IndexedDB: ", err);
      }
    };
    loadDB();
  }, []);

  // AUTO-SAVE DRAG/DROP & EDITS TO PERSISTENT BROWSER DB
  useEffect(() => {
    if (!isDbLoadedRef.current) return;
    const savePlaylistToDB = async () => {
      const dataToSave = playlistArray.map(s => ({
          id: s.id,
          name: s.name,
          artist: s.artist,
          coverArt: s.coverArt,
          file: s.file, // Core physical binary 
          playCount: s.playCount,
          addedAt: s.addedAt,
          note: s.note
      }));
      await set('novobeat_playlist', dataToSave);
    };
    // Debounce or slight delay to not overload IndexedDB isn't needed for small arrays, but it executes here
    savePlaylistToDB();
  }, [playlistArray]);

  useEffect(() => {
    document.documentElement.style.setProperty('--theme-dominant', dominantRgbRef.current);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const initAudio = () => {
    if (audioCtxRef.current || !audioRef.current) return;
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass() as AudioContext;
    audioCtxRef.current = ctx;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.85;
    analyserRef.current = analyser;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.ratio.value = 12;

    const source = ctx.createMediaElementSource(audioRef.current);

    const panner = ctx.createStereoPanner();
    panner.pan.value = 0;
    pannerNodeRef.current = panner;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 22050; 
    lowpassFilterRef.current = lowpass;

    const delay = ctx.createDelay(2.0);
    delay.delayTime.value = 0.25; 
    
    const feedbackGain = ctx.createGain();
    feedbackGain.gain.value = 0.45; 
    
    const echoGain = ctx.createGain(); 
    echoGain.gain.value = 0; 
    echoGainRef.current = echoGain;

    source.connect(delay);
    delay.connect(feedbackGain);
    feedbackGain.connect(delay); 
    delay.connect(echoGain);
    
    source.connect(panner);
    echoGain.connect(panner);

    panner.connect(lowpass);
    lowpass.connect(compressor);
    compressor.connect(analyser);
    analyser.connect(ctx.destination);
  };

  const drawVisualizer = useCallback(() => {
    if (!canvasRef.current || !bgCanvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const bgCanvas = bgCanvasRef.current;
    const bgCtx = bgCanvas.getContext('2d');

    if (!ctx || !bgCtx) return;

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      
      const bufferLength = analyserRef.current ? analyserRef.current.frequencyBinCount : 512;
      const dataArray = new Uint8Array(bufferLength);
      
      if (analyserRef.current) {
        analyserRef.current.getByteFrequencyData(dataArray);
      }

      let bassSum = 0;
      for (let i = 0; i < 15; i++) bassSum += dataArray[i];
      const bassAvg = bassSum / 15;
      
      const bassIntensity = bassAvg / 255;
      const bumpScale = 1 + bassIntensity * 0.25;
      const shakeX = bassAvg > 220 ? (Math.random() - 0.5) * 8 : 0;
      const shakeY = bassAvg > 220 ? (Math.random() - 0.5) * 8 : 0;
      
      document.documentElement.style.setProperty('--bass-bump', String(bumpScale));
      document.documentElement.style.setProperty('--bass-glow', String(bassIntensity * 140) + 'px');
      document.documentElement.style.setProperty('--bass-opacity', String(bassIntensity * 0.8));
      document.documentElement.style.setProperty('--bass-shake', `translate(${shakeX}px, ${shakeY}px)`);

      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;
      const centerY = height / 2;
      
      ctx.beginPath();
      for (let i = 0; i < width; i++) {
        const dataIndex = Math.floor((i / width) * (bufferLength * 0.7));
        const v = dataArray[dataIndex] / 255;
        const y = centerY - (v * height * 0.4);
        if (i === 0) ctx.moveTo(i, y);
        else ctx.lineTo(i, y);
      }
      for (let i = width; i >= 0; i--) {
        const dataIndex = Math.floor((i / width) * (bufferLength * 0.7));
        const v = dataArray[dataIndex] / 255;
        const y = centerY + (v * height * 0.4);
        ctx.lineTo(i, y);
      }
      ctx.closePath();
      ctx.fillStyle = `var(--text-secondary)`;
      ctx.fill();

      let baseRadius = Math.min(bgCanvas.width / 2, bgCanvas.height / 2) * 0.4 + (bassAvg * 1.5);
      const bgCX = bgCanvas.width / 2;
      const bgCY = bgCanvas.height / 2;

      const bgRect = bgCanvas.getBoundingClientRect();
      if (bgCanvas.width !== bgRect.width || bgCanvas.height !== bgRect.height) {
        bgCanvas.width = bgRect.width;
        bgCanvas.height = bgRect.height;
      }
      bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
      
      bgCtx.beginPath();
      const points = 180;
      for (let i = 0; i <= points; i++) {
         const dataIndex = Math.floor((i / points) * (bufferLength * 0.8)); 
         const bump = (dataArray[dataIndex] / 255) * 120;
         const r = baseRadius + bump;
         const angle = (i / points) * Math.PI * 2;
         const x = bgCX + Math.cos(angle) * r;
         const y = bgCY + Math.sin(angle) * r;
         
         if (i === 0) bgCtx.moveTo(x, y);
         else bgCtx.lineTo(x, y);
      }
      bgCtx.closePath();
      
      bgCtx.fillStyle = `rgba(${dominantRgbRef.current}, 0.25)`;
      bgCtx.fill();
      bgCtx.lineWidth = 6;
      bgCtx.strokeStyle = `rgba(${dominantRgbRef.current}, 0.6)`;
      bgCtx.stroke();

      if (bassAvg > 215) {
        for (let i = 0; i < 2; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 2 + Math.random() * 8;
          particlesRef.current.push({
            x: bgCX + Math.cos(angle) * baseRadius,
            y: bgCY + Math.sin(angle) * baseRadius,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: 3 + Math.random() * 6,
            life: 1.0
          });
        }
      }

      bgCtx.fillStyle = `rgb(${dominantRgbRef.current})`;
      bgCtx.shadowBlur = 10;
      bgCtx.shadowColor = `rgb(${dominantRgbRef.current})`;
      
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.015; 

        if (p.life <= 0) {
          particlesRef.current.splice(i, 1);
        } else {
          bgCtx.beginPath();
          bgCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          bgCtx.globalAlpha = p.life;
          bgCtx.fill();
        }
      }
      bgCtx.globalAlpha = 1.0; 
      bgCtx.shadowBlur = 0; 
    };
    draw();
  }, []);

  useEffect(() => {
    drawVisualizer();
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [drawVisualizer]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (pannerNodeRef.current) pannerNodeRef.current.pan.value = pannerValue;
  }, [pannerValue]);

  useEffect(() => {
    if (echoGainRef.current) echoGainRef.current.gain.value = stadiumMode ? 0.6 : 0;
  }, [stadiumMode]);

  useEffect(() => {
    if (lowpassFilterRef.current) {
        lowpassFilterRef.current.frequency.value = underwaterMode ? 400 : 22050;
    }
  }, [underwaterMode]);

  useEffect(() => {
    if (!audioRef.current) return;
    if (nightcoreMode) {
      audioRef.current.playbackRate = 1.35;
      (audioRef.current as any).preservesPitch = false; 
    } else {
      audioRef.current.playbackRate = playbackRate;
      (audioRef.current as any).preservesPitch = true;
    }
  }, [playbackRate, nightcoreMode]);

  const extractID3Tags = (file: File): Promise<{name: string, artist: string, coverUrl: string | null}> => {
    return new Promise((resolve) => {
      jsmediatags.read(file, {
        onSuccess: function(tag: any) {
          let coverUrl = null;
          const picture = tag.tags.picture;
          if (picture) {
            let base64String = "";
            for (let i = 0; i < picture.data.length; i++) {
              base64String += String.fromCharCode(picture.data[i]);
            }
            coverUrl = "data:" + picture.format + ";base64," + window.btoa(base64String);
          }
          resolve({
            name: tag.tags.title || file.name.replace(/\.[^/.]+$/, ""),
            artist: tag.tags.artist || "Artista Desconocido",
            coverUrl
          });
        },
        onError: function() {
          resolve({
            name: file.name.replace(/\.[^/.]+$/, ""),
            artist: "Artista Desconocido",
            coverUrl: null
          });
        }
      });
    });
  };

  const processFiles = async (files: FileList | File[]) => {
    let added = false;
    let localIdx = insertIndex;
    for (const file of Array.from(files)) {
      if (file.type.startsWith('audio/')) {
        const url = URL.createObjectURL(file);
        const metadata = await extractID3Tags(file);

        const newSong: Song = {
          id: Math.random().toString(36).substr(2, 9),
          name: metadata.name,
          artist: metadata.artist,
          coverArt: metadata.coverUrl,
          file: file,
          objectUrl: url,
          playCount: 0,
          addedAt: Date.now(),
          note: '' 
        };
        
        if (insertMode === 'end') {
          listRef.current.append(newSong);
        } else if (insertMode === 'start') {
          listRef.current.prepend(newSong);
        } else {
          listRef.current.insertAt(newSong, localIdx);
          localIdx++;
        }
        
        added = true;
        
        if (!currentNodeRef.current) {
          currentNodeRef.current = listRef.current.head;
          setCurrentSong(newSong);
          updateThemeWithArt(newSong.coverArt);
          if (audioRef.current) audioRef.current.src = url;
        }
      }
    }
    if (added) setPlaylistArray(listRef.current.toArray());
  };

  const updateThemeWithArt = async (coverArtUrl?: string | null) => {
    if (!coverArtUrl) {
      dominantRgbRef.current = '99, 102, 241';
      document.documentElement.style.setProperty('--theme-dominant', `99, 102, 241`);
      document.documentElement.style.setProperty('--theme-accent', `0, 243, 255`);
      return;
    }
    try {
      const colorInfo = await fac.getColorAsync(coverArtUrl);
      const [r, g, b] = colorInfo.value;
      dominantRgbRef.current = `${r}, ${g}, ${b}`;
      document.documentElement.style.setProperty('--theme-dominant', `${r}, ${g}, ${b}`);
      document.documentElement.style.setProperty('--theme-accent', `${255-r}, ${255-g}, ${255-b}`);
    } catch (e) {
      dominantRgbRef.current = '99, 102, 241';
      document.documentElement.style.setProperty('--theme-dominant', `99, 102, 241`);
    }
  };

  const playSong = async () => {
    if (!currentSong || !audioRef.current) return;
    initAudio();
    if (audioCtxRef.current?.state === 'suspended') {
      await audioCtxRef.current.resume();
    }
    
    if (currentNodeRef.current) {
        currentNodeRef.current.data.playCount += 1;
        setPlaylistArray(listRef.current.toArray()); 
    }

    try {
      await audioRef.current.play();
      setIsPlaying(true);
    } catch(e) {
      console.error("Audio block:", e);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      playSong();
    }
  };

  const playNext = () => {
    if (loopMode === 'one' && currentSong) {
      if (audioRef.current) audioRef.current.currentTime = 0;
      playSong();
      return;
    }

    if (currentNodeRef.current && currentNodeRef.current.next) {
      currentNodeRef.current = currentNodeRef.current.next;
    } else if (loopMode === 'all' && listRef.current.head) {
      currentNodeRef.current = listRef.current.head; 
    } else return;

    const song = currentNodeRef.current!.data;
    setCurrentSong(song);
    updateThemeWithArt(song.coverArt);
    if (audioRef.current) audioRef.current.src = song.objectUrl;
    playSong();
  };

  const playPrev = () => {
    if (currentTime > 3) {
      if (audioRef.current) audioRef.current.currentTime = 0;
      return;
    }
    if (currentNodeRef.current && currentNodeRef.current.prev) {
      currentNodeRef.current = currentNodeRef.current.prev;
    } else if (loopMode === 'all' && listRef.current.tail) {
      currentNodeRef.current = listRef.current.tail;
    } else return;

    const song = currentNodeRef.current!.data;
    setCurrentSong(song);
    updateThemeWithArt(song.coverArt);
    if (audioRef.current) audioRef.current.src = song.objectUrl;
    playSong();
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => playNext();

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [loopMode, currentSong]);

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = pos * duration;
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const selectSong = (song: Song) => {
    let current = listRef.current.head;
    while (current) {
      if (current.data.id === song.id) {
        currentNodeRef.current = current;
        setCurrentSong(song);
        updateThemeWithArt(song.coverArt);
        if (audioRef.current) audioRef.current.src = song.objectUrl;
        playSong();
        break;
      }
      current = current.next;
    }
  };

  const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    if (currentNodeRef.current && currentSong) {
      currentNodeRef.current.data.note = text;
      setCurrentSong({...currentSong, note: text});
      setPlaylistArray(listRef.current.toArray()); 
    }
  };

  return (
    <>
      <audio ref={audioRef} crossOrigin="anonymous" style={{ display: 'none' }} />
      <div className="global-art-blur" style={{ backgroundImage: currentSong?.coverArt ? `url(${currentSong.coverArt})` : 'none' }}></div>
      <canvas ref={bgCanvasRef} className="bg-visualizer-canvas" />
      
      <div className="app-container">
        <button className="theme-toggle-btn" onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun size={24} /> : <Moon size={24} />}
        </button>

        <div className="glass-panel main-player">
          <div className="top-section">
            <div className="cover-art-container">
              {currentSong?.coverArt ? (
                <img src={currentSong.coverArt} alt="Cover" className={`cover-art-img ${isPlaying ? 'spinning' : ''}`} crossOrigin="anonymous"/>
              ) : (
                <Disc size={90} style={{ opacity: 0.1 }} />
              )}
            </div>
            
            <div className="now-playing">
              <h2>{currentSong ? currentSong.name : "NovoBeat Core"}</h2>
              <p>{currentSong ? currentSong.artist : "Listo para tu música. Arrastra archivos o haz clic abajo."}</p>
              {currentSong && <div className="meta-info">Reproducciones Totales: {currentSong.playCount}</div>}
            </div>
          </div>

          <div className="visualizer-container">
            <canvas ref={canvasRef} className="visualizer-canvas"></canvas>
          </div>

          <div style={{ width: '100%', marginTop: 'auto' }}>
            <div className="progress-container">
              <span className="time-text">{formatTime(currentTime)}</span>
              <div className="progress-bar-wrapper" onClick={seek}>
                <div className="progress-bar-fill" style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }} />
              </div>
              <span className="time-text">{formatTime(duration)}</span>
            </div>

            <div className="controls-container">
              <button className="control-btn" onClick={() => setLoopMode(v => v === 'all' ? 'one' : v === 'one' ? 'none' : 'all')}>
                {loopMode === 'one' ? <Repeat1 size={24} className="icon-active" /> : <Repeat size={24} className={loopMode === 'all' ? 'icon-active' : ''} />}
              </button>
              
              <button className="control-btn" onClick={playPrev} disabled={!currentNodeRef.current?.prev && loopMode !== 'all'}>
                <SkipBack size={32} />
              </button>
              
              <button className="play-btn" onClick={togglePlay}>
                {isPlaying ? <Pause size={46} /> : <Play size={46} style={{marginLeft: '6px'}} />}
              </button>
              
              <button className="control-btn" onClick={playNext} disabled={!currentNodeRef.current?.next && loopMode !== 'all'}>
                <SkipForward size={32} />
              </button>

              <button className="control-btn" onClick={() => setVolume(v => v > 0 ? 0 : 1)}>
                {volume > 0 ? <Volume2 size={24} /> : <VolumeX size={24} />}
              </button>
            </div>

            <div className="utilities-row">
              <div className="utility-card">
                 <span className="utility-title"><Network size={16}/> Eco 3D (Reverb)</span>
                 <button 
                  className={`fx-btn ${stadiumMode ? 'active' : ''}`}
                  onClick={() => {initAudio(); setStadiumMode(!stadiumMode);}}
                 >
                   {stadiumMode ? 'Activado' : 'Apagado'}
                 </button>
              </div>

              <div className="utility-card">
                 <span className="utility-title"><Waves size={16}/> Modo Submarino</span>
                 <button 
                  className={`fx-btn ${underwaterMode ? 'active' : ''}`}
                  onClick={() => {initAudio(); setUnderwaterMode(!underwaterMode);}}
                 >
                   {underwaterMode ? 'Activado' : 'Apagado'}
                 </button>
              </div>

              <div className="utility-card">
                 <span className="utility-title"><Rocket size={16}/> Filtro Nightcore</span>
                 <button 
                  className={`fx-btn ${nightcoreMode ? 'active' : ''}`}
                  onClick={() => {initAudio(); setNightcoreMode(!nightcoreMode);}}
                 >
                   {nightcoreMode ? 'Activado' : 'Apagado'}
                 </button>
              </div>

              <div className="utility-card">
                 <span className="utility-title"><ArrowRightLeft size={16}/>  Espacializador (Izq/Der)</span>
                 <input type="range" min="-1" max="1" step="0.05" value={pannerValue} onChange={(e) => {initAudio(); setPannerValue(parseFloat(e.target.value));}} />
                 <div style={{display:'flex', justifyContent:'space-between', fontSize:'10px', marginTop:'5px', color:'var(--text-secondary)'}}><span>IZQ</span><span>DER</span></div>
              </div>

              <div className="utility-card">
                 <span className="utility-title"><Gauge size={16}/> Velocidad Personalizada</span>
                 <div style={{ display: 'flex', gap: '20px', alignItems: 'center', height: '100%' }}>
                   <input type="range" min="0.5" max="2" step="0.1" value={playbackRate} onChange={(e) => {setNightcoreMode(false); setPlaybackRate(parseFloat(e.target.value));}} disabled={nightcoreMode} />
                   <span style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--text-primary)' }}>{nightcoreMode ? '1.35' : playbackRate}x</span>
                 </div>
              </div>
            </div>

            <div className="dll-debugger-panel">
               <span className="dll-title"><Radio size={16} /> Mapa de Nodos (Lista Doble Enlazada)</span>
               <div className="dll-map-container">
                 {playlistArray.length === 0 ? <span style={{fontSize:'12px', color:'var(--text-secondary)'}}>Estructura de datos vacía. Inserta canciones.</span> : null}
                 {playlistArray.map((song, i) => (
                   <div key={song.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                     <div className={`dll-node-box ${song.id === currentSong?.id ? 'active' : ''}`}>
                       <strong style={{marginBottom:'2px'}}>{i === 0 ? '[HEAD]' : i === playlistArray.length -1 ? '[TAIL]' : 'NODO'}</strong>
                       <span style={{maxWidth:'80px', overflow:'hidden', textOverflow:'ellipsis'}}>{song.name}</span>
                     </div>
                     {i < playlistArray.length - 1 && (
                       <div className="dll-pointers">
                         <span style={{fontSize:'10px'}}>sig</span>
                         <ArrowRightLeft size={14} />
                         <span style={{fontSize:'10px'}}>ant</span>
                       </div>
                     )}
                   </div>
                 ))}
               </div>
            </div>
          </div>
        </div>

        <div className="glass-panel notes-panel">
           <span className="dll-title"><BookOpen size={20} /> Base de Datos de Notas</span>
           <p style={{fontSize:'0.9rem', color:'var(--text-secondary)'}}>
             Payload del Nodo: Datos ligados de manera estricta a la memoria de la pista elegida. Puedes escribir aquí contexto adicional para la canción:
           </p>
           <textarea 
             className="notebook-area" 
             placeholder={currentSong ? "Escribe texto detallado para acoplarlo al nodo sonoro matemáticamente..." : "Inserta audios para habilitar la memoria del nodo."} 
             value={currentSong?.note || ''} 
             onChange={handleNoteChange}
             disabled={!currentSong}
           />
        </div>

        <div className="glass-panel playlist-panel">
          <div className="top-bar-playlist">
            <h3>Nodos / Playlist</h3>
          </div>
          
          <div style={{ position: 'relative' }}>
             <Search size={22} style={{position: 'absolute', top: '15px', left: '16px', color:'var(--text-secondary)'}} />
             <input 
                type="text" 
                className="search-bar" 
                placeholder="Buscador aproximado de nodos..." 
                style={{ paddingLeft: '50px' }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
             />
          </div>

          <div className="playlist-items">
            {filteredPlaylist.map((song) => {
              const nodeIndex = playlistArray.findIndex(s => s.id === song.id); 
              return (
              <div 
                key={song.id} 
                className={`playlist-item ${currentSong?.id === song.id ? 'active' : ''}`}
                onClick={() => selectSong(song)}
              >
                {song.coverArt ? (
                  <img src={song.coverArt} className="item-art" alt="cover"/>
                ) : (
                  <div className="item-art" style={{ background: 'var(--slider-track)', display: 'flex', justifyContent:'center', alignItems:'center' }}>
                     <Disc size={24} opacity={0.3} color="var(--text-secondary)"/>
                  </div>
                )}
                
                <div className="song-info">
                  <span className="song-name">{song.name}</span>
                  <span className="song-artist">{song.artist} {song.note ? '📝' : ''}</span>
                </div>
                <button className="del-btn" onClick={(e) => { 
                  e.stopPropagation(); 
                  listRef.current.removeAt(nodeIndex);
                  setPlaylistArray(listRef.current.toArray());
                }}>
                  <Trash2 size={24} color="var(--text-secondary)"/>
                </button>
              </div>
            )})}
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: 'auto', marginBottom: '10px' }}>
            <select 
              value={insertMode} 
              onChange={(e) => setInsertMode(e.target.value as any)}
              style={{ flex: 1, padding: '10px', borderRadius: '15px', background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', outline: 'none' }}
            >
              <option value="end">Opción Inserción: Al Final</option>
              <option value="start">Opción Inserción: Al Inicio</option>
              <option value="index">Opción Inserción: Custom Index</option>
            </select>
            {insertMode === 'index' && (
              <input 
                type="number" 
                min="0" 
                max={playlistArray.length}
                value={insertIndex} 
                onChange={(e) => setInsertIndex(parseInt(e.target.value) || 0)}
                style={{ width: '80px', padding: '10px', borderRadius: '15px', background: 'var(--glass-bg)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', outline: 'none' }}
              />
            )}
          </div>

          <div 
            className="drop-zone"
            onClick={() => {
              const input = document.getElementById('audio-file-input') as HTMLInputElement;
              if (input) input.click();
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); processFiles(e.dataTransfer.files); }}
            style={{cursor: 'pointer'}}
          >
            <input 
              id="audio-file-input"
              type="file" 
              multiple 
              accept="audio/*" 
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  processFiles(e.target.files);
                }
                e.target.value = '';
              }}
            />
            <Plus size={36} style={{ margin: '0 auto 10px auto', display: 'block', color: 'var(--text-primary)' }}/>
            Carga tus Pistas Múltiples (MP3/FLAC/WAV)
          </div>

        </div>
      </div>
    </>
  );
}

export default App;
