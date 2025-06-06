// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAqWtjDMQkvzSjC3JmcRYfuMP_VfU3-_E8",
    authDomain: "cast-iron-tasks.firebaseapp.com",
    projectId: "cast-iron-tasks",
    storageBucket: "cast-iron-tasks.firebasestorage.app",
    messagingSenderId: "742460863108",
    appId: "1:742460863108:web:af3fd7ec7f746dd8a948d1"
  };
  
  // Initialize Firebase
  firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();
  const auth = firebase.auth();
  const tasksCollection = db.collection('tasks');
  
  // --- Constants ---
  const TASK_STATUS = { TODO: 'To Do', IN_PROGRESS: 'In Progress', PAUSED: 'Paused', DONE: 'Done' };
  const NOTIFICATION_TYPES = { INFO: 'info', SUCCESS: 'success', ERROR: 'error', CONFIRM: 'confirm' };
  
  // DOM Elements
  let taskTableBody, addTaskBtn, taskTitleInput, benefitScoreInput, complexityScoreInput,
      taskStatusInput, taskTagInput, taskWhoInput, modal, closeModalBtn, saveTaskDetailsBtn,
      modalTaskId, modalTaskTitle, modalBenefitScore, modalComplexityScore, modalTaskStatus,
      modalTaskTag, modalTaskDetails, modalTaskImageUrls, modalImagePreview, modalTaskWho,
      exportCsvButton, loginContainer, appContainer, loginEmailInput, loginPasswordInput,
      loginButton, loginErrorMessage, logoutButton;
  
  let elementToFocusOnModalClose = null;
  let allFetchedTasks = [];
  let appInitialized = false;
  let firestoreListenerUnsubscribe = null;
  
  // --- Helper Functions ---
  const calculatePriorityScore = (b, c) => (Number(b) || 0) - (Number(c) || 0);
  const getScoringCategory = (t) => { const b = Number(t.benefitScore)||0, c = Number(t.complexityScore)||0; if (b && c) return 2; if (b || c) return 1; return 0; };
  function autoResizeTextarea(el) { if (!el) return; el.style.height="auto"; el.style.height=(el.scrollHeight)+"px"; }
  const showNotification = (msg, type=NOTIFICATION_TYPES.INFO, dur=3000) => {
      console.log(`NOTIFY (${type}): ${msg}`);
      const el = document.createElement('div'); el.className = `notification ${type}`; el.textContent = msg;
      document.body.appendChild(el); setTimeout(() => el.classList.add('show'), 10);
      if (type === NOTIFICATION_TYPES.CONFIRM) { document.body.removeChild(el); return window.confirm(msg); }
      setTimeout(() => { el.classList.remove('show'); setTimeout(() => { if (document.body.contains(el)) document.body.removeChild(el); }, 300); }, dur);
  };
  const getStatusClass = (s) => ({ [TASK_STATUS.TODO]:'status-todo', [TASK_STATUS.IN_PROGRESS]:'status-inprogress', [TASK_STATUS.PAUSED]:'status-paused', [TASK_STATUS.DONE]:'status-done' }[s] || '');
  const getValidatedScore = (val) => { if (val===''||val==null) return 0; let s=parseInt(val,10); if(isNaN(s)) return 0; if(s<1) return 1; if(s>10) return 10; return s; };
  const handleScoreInput = (e) => { const el=e.target; let v=el.value; if(v==='') return; let nV=parseInt(v,10); if(isNaN(nV)){el.value='';return;} if(nV>10)el.value='10'; else if(nV<1)el.value='1';};
  const statusOptions = [TASK_STATUS.TODO, TASK_STATUS.IN_PROGRESS, TASK_STATUS.PAUSED, TASK_STATUS.DONE];
  const populateStatusDropdown = (sel) => { if(!sel)return; sel.innerHTML=''; statusOptions.forEach(sV=>{const o=document.createElement('option');o.value=sV;o.textContent=sV;sel.appendChild(o);});};
  function escapeCsvField(fld) { if(fld==null)return''; let sF=String(fld); if(sF.search(/("|,|\n)/g)>=0)sF='"'+sF.replace(/"/g,'""')+'"'; return sF; }
  
  // --- Core Functions ---
  const renderTasks = (tasks) => {
      if(!taskTableBody){console.error("renderTasks: taskTableBody N/A"); return;}
      taskTableBody.innerHTML=''; if(tasks.length===0){const r=taskTableBody.insertRow(),c=r.insertCell();c.colSpan=8;c.textContent='No tasks yet.';c.style.textAlign='center';return;}
      tasks.forEach((t,idx)=>{const r=taskTableBody.insertRow();r.setAttribute('data-id',t.id);r.tabIndex=0;if(t.status===TASK_STATUS.DONE)r.classList.add('task-done');
      r.insertCell().textContent=idx+1;r.insertCell().textContent=t.title;r.insertCell().textContent=t.benefitScore===0?'':t.benefitScore;r.insertCell().textContent=t.complexityScore===0?'':t.complexityScore;
      const sC=r.insertCell(),sS=document.createElement('span');sS.textContent=t.status;sS.className=`status-badge ${getStatusClass(t.status)}`;sC.appendChild(sS);
      r.insertCell().textContent=t.tag||'';r.insertCell().textContent=t.who||'';const aC=r.insertCell(),dB=document.createElement('button');dB.textContent='Delete';dB.className='action-btn delete-btn';dB.type='button';
      dB.onclick=async(e)=>{e.stopPropagation();dB.disabled=true;dB.textContent='Deleting...';await deleteTask(t.id);};aC.appendChild(dB);
      const hRI=()=>openTaskModal(t);r.onclick=hRI;r.onkeydown=(e)=>{if(e.key==='Enter'||e.key===' ') {e.preventDefault();hRI();}};});
  };
  const addTask = async () => {
      if(!taskTitleInput){console.error("addTask: elements N/A");return;} const title=taskTitleInput.value.trim(); if(!title){showNotification('Title required',NOTIFICATION_TYPES.ERROR);taskTitleInput.focus();return;}
      addTaskBtn.disabled=true;addTaskBtn.textContent='Adding...';const bS=getValidatedScore(benefitScoreInput.value),cS=getValidatedScore(complexityScoreInput.value);const pS=calculatePriorityScore(bS,cS);
      const nT={title,benefitScore:bS,complexityScore:cS,priorityScore:pS,status:taskStatusInput.value,tag:taskTagInput.value.trim(),who:taskWhoInput.value.trim(),details:'',imageUrls:[],createdAt:firebase.firestore.FieldValue.serverTimestamp()};
      try{await tasksCollection.add(nT);showNotification('Task added',NOTIFICATION_TYPES.SUCCESS);taskTitleInput.value='';benefitScoreInput.value='';complexityScoreInput.value='';if(taskStatusInput)taskStatusInput.value=TASK_STATUS.TODO;taskTagInput.value='';taskWhoInput.value='';taskTitleInput.focus();}
      catch(err){console.error("Add task error:",err);showNotification("Error adding task",NOTIFICATION_TYPES.ERROR);}
      finally{if(addTaskBtn){addTaskBtn.disabled=false;addTaskBtn.textContent='Add Task';}}
  };
  const deleteTask = async (id) => {
      const conf=showNotification('Delete task?',NOTIFICATION_TYPES.CONFIRM); if(!conf)return;
      try{await tasksCollection.doc(id).delete();showNotification('Task deleted',NOTIFICATION_TYPES.SUCCESS);}
      catch(err){console.error("Delete task error:",err);showNotification("Error deleting task",NOTIFICATION_TYPES.ERROR);
      if(taskTableBody){const rWE=taskTableBody.querySelector(`tr[data-id="${id}"]`);if(rWE){const b=rWE.querySelector('.delete-btn');if(b){b.disabled=false;b.textContent='Delete';}}}}
  };
  const openTaskModal = (t) => {
      if(!modal){console.error("openTaskModal: elements N/A");return;} elementToFocusOnModalClose=document.activeElement;
      modalTaskId.value=t.id;modalTaskTitle.value=t.title;modalBenefitScore.value=t.benefitScore===0?'':t.benefitScore;modalComplexityScore.value=t.complexityScore===0?'':t.complexityScore;
      if(modalTaskStatus)modalTaskStatus.value=t.status;modalTaskTag.value=t.tag||'';modalTaskWho.value=t.who||'';modalTaskDetails.value=t.details||'';
      modalTaskImageUrls.value=(t.imageUrls&&Array.isArray(t.imageUrls))?t.imageUrls.join('\n'):'';renderModalImagePreview(t.imageUrls||[]);
      modal.style.display='block';autoResizeTextarea(modalTaskDetails);autoResizeTextarea(modalTaskImageUrls);if(modalTaskTitle)modalTaskTitle.focus();
  };
  const renderModalImagePreview = (urls) => {
      if(!modalImagePreview){console.error("renderModalImagePreview: N/A");return;} modalImagePreview.innerHTML='';
      if(urls&&Array.isArray(urls)&&urls.length>0){urls.forEach(u=>{const tU=String(u).trim();if(tU==='')return;
      const i=document.createElement('img');i.src=tU;i.alt='Preview';i.onerror=()=>{i.style.display='none';const eT=document.createElement('span');eT.textContent=`(Fail: ${tU.slice(0,30)}...)`;eT.style.cssText='font-size:0.8em;color:red';if(i.parentNode)i.parentNode.insertBefore(eT,i.nextSibling);};modalImagePreview.appendChild(i);});}
  };
  const closeModal = () => {
      if(!modal){console.error("closeModal: N/A");return;} modal.style.display='none';if(modalImagePreview)modalImagePreview.innerHTML='';
      if(modalTaskDetails)modalTaskDetails.style.height='auto';if(modalTaskImageUrls)modalTaskImageUrls.style.height='auto';
      if(elementToFocusOnModalClose){elementToFocusOnModalClose.focus();elementToFocusOnModalClose=null;}
  };
  const saveTaskDetails = async () => {
      if(!modalTaskId){console.error("saveTaskDetails: N/A");return;} const id=modalTaskId.value;if(!id){showNotification('ID missing',NOTIFICATION_TYPES.ERROR);return;}
      const title=modalTaskTitle.value.trim();if(!title){showNotification('Title required',NOTIFICATION_TYPES.ERROR);modalTaskTitle.focus();return;}
      saveTaskDetailsBtn.disabled=true;saveTaskDetailsBtn.textContent='Saving...';const imgUrls=modalTaskImageUrls.value.split('\n').map(u=>u.trim()).filter(u=>u!=='');
      const bS=getValidatedScore(modalBenefitScore.value),cS=getValidatedScore(modalComplexityScore.value);const pS=calculatePriorityScore(bS,cS);
      const uD={title,benefitScore:bS,complexityScore:cS,priorityScore:pS,status:modalTaskStatus.value,tag:modalTaskTag.value.trim(),who:modalTaskWho.value.trim(),details:modalTaskDetails.value.trim(),imageUrls:imgUrls};
      try{await tasksCollection.doc(id).update(uD);showNotification('Task saved',NOTIFICATION_TYPES.SUCCESS);closeModal();}
      catch(err){console.error("Save task error:",err);showNotification("Error saving",NOTIFICATION_TYPES.ERROR);}
      finally{if(saveTaskDetailsBtn){saveTaskDetailsBtn.disabled=false;saveTaskDetailsBtn.textContent='Save Changes';}}
  };
  const exportTasksToCsv = () => {
      if(!allFetchedTasks||allFetchedTasks.length===0){showNotification("No tasks",NOTIFICATION_TYPES.INFO);return;}
      const hdrs=["Rank","Title","Benefit","Complexity","Status","Tag","Who","Details","Image URLs (;)"];let csv=hdrs.join(",")+"\n";
      allFetchedTasks.forEach((t,idx)=>{const iUS=(t.imageUrls&&Array.isArray(t.imageUrls))?t.imageUrls.join('; '):'';
      const r=[idx+1,t.title,t.benefitScore===0?'':t.benefitScore,t.complexityScore===0?'':t.complexityScore,t.status,t.tag||'',t.who||'',t.details||'',iUS];
      csv+=r.map(f=>escapeCsvField(f)).join(",")+"\n";});
      const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});const lnk=document.createElement("a");
      if(lnk.download!==undefined){const url=URL.createObjectURL(blob);lnk.setAttribute("href",url);lnk.setAttribute("download","tasks.csv");
      lnk.style.visibility='hidden';document.body.appendChild(lnk);lnk.click();document.body.removeChild(lnk);URL.revokeObjectURL(url);}
      else{showNotification("CSV export N/A",NOTIFICATION_TYPES.ERROR);}
  };
  
  // --- Login/Logout Functions ---
  const handleLogin = async () => {
      if (!loginEmailInput || !loginPasswordInput || !loginButton || !loginErrorMessage) { console.error("Login form elements missing."); return; }
      const email = loginEmailInput.value; const password = loginPasswordInput.value;
      loginErrorMessage.textContent = ''; loginErrorMessage.style.display = 'none';
      loginButton.disabled = true; loginButton.textContent = 'Logging in...';
      try {
          await auth.signInWithEmailAndPassword(email, password);
          // onAuthStateChanged will handle UI update
      } catch (error) {
          console.error("Login failed:", error);
          loginErrorMessage.textContent = error.message; // Show Firebase error message
          loginErrorMessage.style.display = 'block';
      } finally {
          if (loginButton) { loginButton.disabled = false; loginButton.textContent = 'Login'; }
      }
  };
  
  const handleLogout = async () => {
      try { await auth.signOut(); /* onAuthStateChanged will handle UI update */ }
      catch (error) { console.error("Sign out error:", error); showNotification("Sign out error", NOTIFICATION_TYPES.ERROR); }
  };
  
  // --- Application Initialization & UI Management ---
  function initializeAppLogic(user) {
      console.log("initializeAppLogic called. User:", user ? user.uid : "None");
      appInitialized = true;
  
      taskTableBody = document.querySelector('#taskTable tbody');
      addTaskBtn = document.getElementById('addTaskBtn');
      taskTitleInput = document.getElementById('taskTitle');
      benefitScoreInput = document.getElementById('benefitScore');
      complexityScoreInput = document.getElementById('complexityScore');
      taskStatusInput = document.getElementById('taskStatus');
      taskTagInput = document.getElementById('taskTag');
      taskWhoInput = document.getElementById('taskWho');
      modal = document.getElementById('taskModal');
      closeModalBtn = document.querySelector('.close-button');
      saveTaskDetailsBtn = document.getElementById('saveTaskDetailsBtn');
      modalTaskId = document.getElementById('modalTaskId');
      modalTaskTitle = document.getElementById('modalTaskTitle');
      modalBenefitScore = document.getElementById('modalBenefitScore');
      modalComplexityScore = document.getElementById('modalComplexityScore');
      modalTaskStatus = document.getElementById('modalTaskStatus');
      modalTaskTag = document.getElementById('modalTaskTag');
      modalTaskDetails = document.getElementById('modalTaskDetails');
      modalTaskImageUrls = document.getElementById('modalTaskImageUrls');
      modalImagePreview = document.getElementById('modalImagePreview');
      modalTaskWho = document.getElementById('modalTaskWho');
      exportCsvButton = document.getElementById('exportCsvBtn');
      logoutButton = document.getElementById('logoutButton');
  
      if (!taskTableBody || !addTaskBtn /* more checks if needed */) {
          console.error("Critical app DOM elements N/A in initializeAppLogic."); return;
      }
  
      if (taskStatusInput) { populateStatusDropdown(taskStatusInput); taskStatusInput.value = TASK_STATUS.TODO; }
      if (modalTaskStatus) { populateStatusDropdown(modalTaskStatus); }
  
      if (addTaskBtn) addTaskBtn.addEventListener('click', addTask);
      if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
      if (saveTaskDetailsBtn) saveTaskDetailsBtn.addEventListener('click', saveTaskDetails);
      if (exportCsvButton) exportCsvButton.addEventListener('click', exportTasksToCsv);
      if (logoutButton) logoutButton.addEventListener('click', handleLogout);
      if (benefitScoreInput) benefitScoreInput.addEventListener('input', handleScoreInput);
      if (complexityScoreInput) complexityScoreInput.addEventListener('input', handleScoreInput);
      if (modalBenefitScore) modalBenefitScore.addEventListener('input', handleScoreInput);
      if (modalComplexityScore) modalComplexityScore.addEventListener('input', handleScoreInput);
      if (modalTaskDetails) modalTaskDetails.addEventListener('input', function(){autoResizeTextarea(this);});
      if (modalTaskImageUrls) { modalTaskImageUrls.addEventListener('input', function(){autoResizeTextarea(this);const u=this.value.split('\n').map(s=>s.trim()).filter(s=>s);renderModalImagePreview(u);});}
      window.onclick=(e)=>{if(modal&&e.target==modal)closeModal();};
      window.onkeydown=(e)=>{if(modal&&e.key==='Escape'&&modal.style.display==='block')closeModal();};
  
      console.log("Setting up Firestore listener in initializeAppLogic");
      if (firestoreListenerUnsubscribe) firestoreListenerUnsubscribe(); // Detach old one if exists
      firestoreListenerUnsubscribe = tasksCollection.orderBy('createdAt', 'desc')
          .onSnapshot(snapshot => {
              console.log("Firestore data received (logged in).");
              let tasksFromDb = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
              tasksFromDb.sort((a,b)=>{const iDA=a.status===TASK_STATUS.DONE,iDB=b.status===TASK_STATUS.DONE;if(iDA!==iDB)return iDA?1:-1;if(iDA&&iDB)return(b.createdAt?.toDate()?.getTime()||0)-(a.createdAt?.toDate()?.getTime()||0);const cA=getScoringCategory(a),cB=getScoringCategory(b);if(cA!==cB)return cB-cA;if(cA===2){const pA=a.priorityScore,pB=b.priorityScore;if(pA!==pB)return pB-pA;}return(b.createdAt?.toDate()?.getTime()||0)-(a.createdAt?.toDate()?.getTime()||0);});
              allFetchedTasks = tasksFromDb;
              renderTasks(allFetchedTasks);
          }, error => {
              console.error("Firestore onSnapshot error (logged in):", error);
              if(error.code === 'permission-denied'){showNotification("Data permission denied.",NOTIFICATION_TYPES.ERROR,7000); /* auth.signOut(); Optional */}
              else{showNotification("Error fetching tasks.",NOTIFICATION_TYPES.ERROR);}
          });
  }
  
  function handleAuthStateChange(user) {
      // Ensure DOM elements for login/app containers are fetched (idempotent)
      loginContainer = loginContainer || document.getElementById('loginContainer');
      appContainer = appContainer || document.getElementById('appContainer');
      loginEmailInput = loginEmailInput || document.getElementById('loginEmail');
      loginPasswordInput = loginPasswordInput || document.getElementById('loginPassword');
      loginButton = loginButton || document.getElementById('loginButton');
      loginErrorMessage = loginErrorMessage || document.getElementById('loginErrorMessage');
  
      if (!loginContainer || !appContainer) { console.error("Login/App container N/A."); return; }
  
      if (user) {
          console.log("Auth state: User logged in (UID:", user.uid, "). Showing app.");
          loginContainer.style.display = 'none';
          appContainer.style.display = 'block'; // Show the main app container
          if (!appInitialized) {
              initializeAppLogic(user);
          }
      } else {
          console.log("Auth state: User logged out. Showing login form.");
          loginContainer.style.display = 'block';
          appContainer.style.display = 'none'; // Hide the main app container
          appInitialized = false;
          if (firestoreListenerUnsubscribe) { console.log("Detaching Firestore listener."); firestoreListenerUnsubscribe(); firestoreListenerUnsubscribe = null; }
          if (taskTableBody) taskTableBody.innerHTML = '';
          allFetchedTasks = [];
          if (loginButton && !loginButton.hasAttribute('data-listener-set')) {
              loginButton.addEventListener('click', handleLogin);
              loginButton.setAttribute('data-listener-set', 'true'); // Prevent multiple listeners
          }
          if (loginErrorMessage) { loginErrorMessage.textContent = ''; loginErrorMessage.style.display = 'none'; }
          if (loginEmailInput) loginEmailInput.value = '';
          if (loginPasswordInput) loginPasswordInput.value = '';
      }
  }
  
  // --- Entry Point: Listen for DOM ready, then set up Auth Listener ---
  document.addEventListener('DOMContentLoaded', () => {
      console.log("DOM fully loaded. Setting up auth state listener.");
      // Initial UI setup based on current auth state (e.g. if user is already logged in from a previous session)
      handleAuthStateChange(auth.currentUser);
  
      // Listen for subsequent auth state changes
      auth.onAuthStateChanged(user => {
          handleAuthStateChange(user);
      });
  });