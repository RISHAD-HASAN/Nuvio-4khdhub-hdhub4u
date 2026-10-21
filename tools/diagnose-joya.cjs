// Local diagnostic only. Nothing is uploaded; stream tokens aren't printed.
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const args=process.argv.slice(2),id=args[0] || '603',type=args[1] || 'movie';
const context={module:{exports:{}},console,require,fetch,URL,AbortController,setTimeout,clearTimeout};
vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'providers/joya9tv.js'),'utf8'),context);
context.module.exports.getStreams(id,type,args[2]?Number(args[2]):undefined,args[3]?Number(args[3]):undefined)
 .then(rows=>console.log('Returned entries:',rows.length,'(playback not tested)'))
 .catch(error=>{console.error(error.message);process.exitCode=1;});
