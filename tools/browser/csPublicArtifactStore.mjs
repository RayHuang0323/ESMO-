import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const CS_PUBLIC_CACHE_NAME='.cs-public-cache-v1';
const digest=async file=>{const hash=createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex');};
const within=(root,file)=>file.startsWith(root+path.sep);

// Cache files are private immutable copies, never links to mutable public/.
// Archives remain ordinary standalone files even if the cache entry is removed.
// A changed source creates a new content address; corrupt entries fail closed.
export async function archiveCsPublicAssets({publicRoot,archiveRoot,cacheRoot,preferLinks=true}){
  publicRoot=path.resolve(publicRoot);archiveRoot=path.resolve(archiveRoot);cacheRoot=path.resolve(cacheRoot);
  if([publicRoot,archiveRoot,cacheRoot].some((a,i,list)=>list.some((b,j)=>i!==j&&(a===b||within(a,b)))))throw new Error('CS資產來源、archive與cache不得重疊');
  for(const root of[publicRoot,archiveRoot,cacheRoot])if(fs.existsSync(root)&&fs.lstatSync(root).isSymbolicLink())throw new Error('CS資產封存根目錄不得使用symlink');
  fs.mkdirSync(cacheRoot,{recursive:true});
  const result={version:'cs-public-content-address.v1',files:0,logicalBytes:0,linkedFiles:0,copiedFiles:0,newCacheFiles:0,newCacheBytes:0};
  const walk=async relative=>{
    const source=path.join(publicRoot,relative),target=path.join(archiveRoot,relative),stat=fs.lstatSync(source);
    if(!within(publicRoot,source)||!within(archiveRoot,target)||stat.isSymbolicLink())throw new Error('CS資產封存路徑或symlink不合法：'+relative);
    if(stat.isDirectory()){
      if(fs.existsSync(target)){if(fs.lstatSync(target).isSymbolicLink()||!fs.statSync(target).isDirectory())throw new Error('CS資產目标目錄不合法：'+relative);}
      else fs.mkdirSync(target,{recursive:true});
      for(const entry of fs.readdirSync(source).sort())await walk(path.join(relative,entry));
      return;
    }
    if(!stat.isFile()||fs.existsSync(target))throw new Error('CS資產不可覆寫或不是一般檔案：'+relative);
    const sha=await digest(source),cached=path.join(cacheRoot,sha);
    if(fs.existsSync(cached)){
      const existing=fs.lstatSync(cached);
      if(!existing.isFile()||existing.isSymbolicLink()||existing.size!==stat.size||await digest(cached)!==sha)throw new Error('CS資產內容快取損毀，不覆寫既有證據：'+sha);
    }else{
      fs.copyFileSync(source,cached,fs.constants.COPYFILE_EXCL);
      if(await digest(cached)!==sha)throw new Error('CS資產封存期間來源改變，不連結不一致內容：'+relative);
      result.newCacheFiles++;result.newCacheBytes+=stat.size;
    }
    // File permission is shared by hard links. Make the private content
    // read-only so a later accidental archive write cannot alter siblings.
    fs.chmodSync(cached,0o444);
    let linked=false;
    if(preferLinks)try{fs.linkSync(cached,target);linked=true;}catch(error){
      // Only unsupported links/cross-volume/permission errors use a full copy.
      // EEXIST or other unexpected failures must not overwrite an archive.
      if(!['EPERM','EACCES','EXDEV','ENOTSUP','EOPNOTSUPP','ENOSYS'].includes(error.code))throw error;
    }
    if(!linked)fs.copyFileSync(cached,target,fs.constants.COPYFILE_EXCL);
    if(await digest(target)!==sha)throw new Error('CS資產archive內容不符：'+relative);
    result.files++;result.logicalBytes+=stat.size;result[linked?'linkedFiles':'copiedFiles']++;
  };
  for(const relative of['assets/fps','audio/cs'])await walk(relative);
  return result;
}
