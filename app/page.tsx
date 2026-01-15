export default function Home() { return ( 
<div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-white font-sans"> 
    <h1 className="text-5xl font-bold mb-4 text-emerald-500">StudyTimer</h1> 
    <p className="text-xl text-zinc-400 mb-8 text-center px-4"> Socially pressured studying. <br/> Stay focused with your friends. </p> 
    <div className="bg-zinc-900 p-8 rounded-2xl border border-zinc-800 shadow-xl w-80 text-center"> 
        <div className="text-6-xl font-mono mb-6 text-6xl">25:00</div> 
          <button className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-lg font-semibold transition-all"> Start Session </button> 
        </div> 
    </div> ); 
        } 
        