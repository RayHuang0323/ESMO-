param([Parameter(Mandatory=$true)][string]$FileListPath,[switch]$ExclusiveReadMetadata)
# Windows native, read-only. Never terminates/restarts a process. Caller supplies explicit CS archive file names.
$ErrorActionPreference='Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$resourceFiles = @((Get-Content -Raw -Encoding UTF8 -LiteralPath $FileListPath | ConvertFrom-Json) | ForEach-Object { [string]$_ })
if (!$resourceFiles.Count) { throw 'Empty archive resource list' }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using System.Text;
public static class CsArchiveNativeRead {
 [StructLayout(LayoutKind.Sequential)] public struct RM_UNIQUE_PROCESS { public int id; public System.Runtime.InteropServices.ComTypes.FILETIME start; }
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] public struct RM_PROCESS_INFO { public RM_UNIQUE_PROCESS process; [MarshalAs(UnmanagedType.ByValTStr,SizeConst=256)] public string name; [MarshalAs(UnmanagedType.ByValTStr,SizeConst=64)] public string service; public int appType; public uint appStatus; public uint session; [MarshalAs(UnmanagedType.Bool)] public bool restartable; }
 [DllImport("rstrtmgr.dll",CharSet=CharSet.Unicode)] static extern int RmStartSession(out uint handle,int flags,StringBuilder key);
 [DllImport("rstrtmgr.dll",CharSet=CharSet.Unicode)] static extern int RmRegisterResources(uint handle,uint count,[MarshalAs(UnmanagedType.LPArray,ArraySubType=UnmanagedType.LPWStr)] string[] files,uint appCount,IntPtr apps,uint serviceCount,[MarshalAs(UnmanagedType.LPArray,ArraySubType=UnmanagedType.LPWStr)] string[] services);
 [DllImport("rstrtmgr.dll")] static extern int RmGetList(uint handle,out uint needed,ref uint count,[In,Out] RM_PROCESS_INFO[] list,ref uint reason);
 [DllImport("rstrtmgr.dll")] static extern int RmEndSession(uint handle);
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint rights,bool inherit,int pid);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool ReadProcessMemory(IntPtr process,IntPtr address,byte[] data,int size,out IntPtr read);
 [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr process,int cls,byte[] info,int size,out int written);
 public static int[] ResourcePids(string[] files) {
  uint handle;var key=new StringBuilder(33);int code=RmStartSession(out handle,0,key);if(code!=0)throw new Exception("RmStartSession="+code);
  try { for(int i=0;i<files.Length;i+=256){var batch=new string[Math.Min(256,files.Length-i)];Array.Copy(files,i,batch,0,batch.Length);code=RmRegisterResources(handle,(uint)batch.Length,batch,0,IntPtr.Zero,0,null);if(code!=0)throw new Exception("RmRegisterResources="+code+"; batchStart="+i);}
   uint needed=0,count=0,reason=0;code=RmGetList(handle,out needed,ref count,null,ref reason);if(code==0)return new int[0];if(code!=234)throw new Exception("RmGetList="+code);
   for(int i=0;i<4;i++){count=needed;var rows=new RM_PROCESS_INFO[count];code=RmGetList(handle,out needed,ref count,rows,ref reason);if(code==234)continue;if(code!=0)throw new Exception("RmGetList="+code);var pids=new List<int>();for(int n=0;n<count;n++)pids.Add(rows[n].process.id);return pids.ToArray();}throw new Exception("RmGetList changed repeatedly");
  } finally { RmEndSession(handle); }
 }
 static byte[] Read(IntPtr handle,long pointer,int count){var b=new byte[count];IntPtr read;if(!ReadProcessMemory(handle,new IntPtr(pointer),b,count,out read)||read.ToInt64()!=count)throw new Exception("ReadProcessMemory="+Marshal.GetLastWin32Error());return b;}
 public static string CurrentDirectory(int pid) {
  var handle=OpenProcess(0x410,false,pid);if(handle==IntPtr.Zero)throw new Exception("OpenProcess="+Marshal.GetLastWin32Error());
  try{int written;var basic=new byte[48];if(NtQueryInformationProcess(handle,0,basic,basic.Length,out written)!=0)throw new Exception("NtQueryInformationProcess");long peb=BitConverter.ToInt64(basic,8);var wow=new byte[8];if(NtQueryInformationProcess(handle,26,wow,8,out written)!=0)throw new Exception("NtQueryWow64");long peb32=BitConverter.ToInt64(wow,0);bool x32=peb32!=0;if(x32)peb=peb32;long parameters=x32?BitConverter.ToUInt32(Read(handle,peb+0x10,4),0):BitConverter.ToInt64(Read(handle,peb+0x20,8),0);var unicode=Read(handle,parameters+(x32?0x24:0x38),x32?8:16);int length=BitConverter.ToUInt16(unicode,0);long buffer=x32?BitConverter.ToUInt32(unicode,4):BitConverter.ToInt64(unicode,8);if(length<=0||length>32766)throw new Exception("CurrentDirectory length");return Encoding.Unicode.GetString(Read(handle,buffer,length));}finally{CloseHandle(handle);}
 }
}
'@
$pidResult = @()
$resourceFailures = @()
if ($ExclusiveReadMetadata) {
 foreach ($resourcePath in $resourceFiles) {
  $stream = $null
  try { $stream = [System.IO.File]::Open($resourcePath,[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::None) }
  catch { $resourceFailures += [pscustomobject]@{path=$resourcePath;error=$_.Exception.Message} }
  finally { if ($stream) { $stream.Dispose() } }
 }
} else { $pidResult = @([CsArchiveNativeRead]::ResourcePids([string[]]$resourceFiles)) }
$cwdResult = @()
foreach ($entry in @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.Name -match '^(node|powershell|pwsh|cmd|python|blender|chrome)\.exe$' })) {
 $scopeMention = $entry.CommandLine -and ($entry.CommandLine.Contains('cs-fps-major-upgrade') -or $entry.CommandLine.Contains('cs-major-upgrade'))
 $archiveNames = @([regex]::Matches([string]$entry.CommandLine,'(?:phase|diagnostic)-[A-Za-z0-9_-]+') | ForEach-Object { $_.Value })
 try { $directory = [CsArchiveNativeRead]::CurrentDirectory($entry.ProcessId); $cwdResult += [pscustomobject]@{pid=$entry.ProcessId;name=$entry.Name;scopeMention=[bool]$scopeMention;archiveNames=$archiveNames;cwd=$directory;cwdStatus='READ'} }
 catch { $cwdResult += [pscustomobject]@{pid=$entry.ProcessId;name=$entry.Name;scopeMention=[bool]$scopeMention;archiveNames=$archiveNames;cwd=$null;cwdStatus='UNKNOWN';error=$_.Exception.InnerException.Message} }
}
[pscustomobject]@{schema='cs-archive-resource-use.v2';checkedAt=(Get-Date).ToUniversalTime().ToString('o');method=$(if($ExclusiveReadMetadata){'Read-only exclusive FileShare.None open, no content read, plus process PEB cwd'}else{'Restart Manager resources plus process PEB cwd'});nativeExit=0;files=$resourceFiles.Count;resourcePids=@($pidResult);resourceFailures=@($resourceFailures);processes=$cwdResult;processControlPerformed=$false;limit='Snapshot only. Exclusive read probes detect incompatible data handles/access failures, not metadata-only handles. Any resource failure or unknown scope-relevant cwd blocks that candidate; repeat immediately before execution.'} | ConvertTo-Json -Depth 6 -Compress
