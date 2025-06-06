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
  
  // --- Helper Functions (Identical to previous full version) ---
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
  const renderTasks = (tasksToRender) => { // No 'viewingDeleted' parameter needed now
      if (!taskTableBody) { console.error("renderTasks: taskTableBody not available."); return; }
      taskTableBody.innerHTML = '';
      if (tasksToRender.length === 0) {
          const r = taskTableBody.insertRow(), c = r.insertCell();
          c.colSpan = 8; c.textContent = 'No active tasks yet. Add one above!'; c.style.textAlign = 'center';
          return;
      }
      tasksToRender.forEach((task, index) => {
          const row = taskTableBody.insertRow();
          row.setAttribute('data-id', task.id); row.tabIndex = 0;
          if (task.status === TASK_STATUS.DONE) row.classList.add('task-done');
          row.insertCell().textContent = index + 1;
          row.insertCell().textContent = task.title;
          row.insertCell().textContent = task.benefitScore === 0 ? '' : task.benefitScore;
          row.insertCell().textContent = task.complexityScore === 0 ? '' : task.complexityScore;
          const statusCell = row.insertCell(), statusSpan = document.createElement('span');
          statusSpan.textContent = task.status; statusSpan.className = `status-badge ${getStatusClass(task.status)}`;
          statusCell.appendChild(statusSpan);
          row.insertCell().textContent = task.tag || '';
          row.insertCell().textContent = task.who || '';
          const actionsCell = row.insertCell();
          const softDeleteBtn = document.createElement('button'); // Changed from generic deleteBtn
          softDeleteBtn.textContent = 'Delete';
          softDeleteBtn.classList.add('action-btn', 'delete-btn');
          softDeleteBtn.type = 'button';
          softDeleteBtn.onclick = async (e) => { e.stopPropagation(); softDeleteBtn.disabled = true; softDeleteBtn.textContent = 'Deleting...'; await deleteTask(task.id); }; // deleteTask now does soft delete
          actionsCell.appendChild(softDeleteBtn);
          const handleRowInteraction = () => openTaskModal(task);
          row.onclick = handleRowInteraction;
          row.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleRowInteraction(); } };
      });
  };
  
  // MODIFIED: addTask to include isDeleted: false and deletedAt: null
  const addTask = async () => {
      if (!taskTitleInput) { console.error("addTask: elements N/A"); return; }
      const title = taskTitleInput.value.trim();
      if (!title) { showNotification('Title required', NOTIFICATION_TYPES.ERROR); taskTitleInput.focus(); return; }
      if (addTaskBtn) { addTaskBtn.disabled = true; addTaskBtn.textContent = 'Adding...'; }
      const benefitScoreVal = getValidatedScore(benefitScoreInput.value);
      const complexityScoreVal = getValidatedScore(complexityScoreInput.value);
      const priorityScore = calculatePriorityScore(benefitScoreVal, complexityScoreVal);
      const newTask = {
          title, benefitScore: benefitScoreVal, complexityScore: complexityScoreVal, priorityScore,
          status: taskStatusInput.value, tag: taskTagInput.value.trim(), who: taskWhoInput.value.trim(),
          details: '', imageUrls: [],
          isDeleted: false, // Default to not deleted
          deletedAt: null,  // Default to null
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      try {
          await tasksCollection.add(newTask);
          showNotification('Task added', NOTIFICATION_TYPES.SUCCESS);
          taskTitleInput.value = ''; benefitScoreInput.value = ''; complexityScoreInput.value = '';
          if (taskStatusInput) taskStatusInput.value = TASK_STATUS.TODO;
          taskTagInput.value = ''; taskWhoInput.value = '';
          taskTitleInput.focus();
      } catch (err) {
          console.error("Add task error:", err); showNotification("Error adding task", NOTIFICATION_TYPES.ERROR);
      } finally {
          if (addTaskBtn) { addTaskBtn.disabled = false; addTaskBtn.textContent = 'Add Task'; }
      }
  };
  
  // MODIFIED: deleteTask to perform a soft delete
  const deleteTask = async (taskId) => {
      const confirmed = showNotification('Are you sure you want to delete this task?', NOTIFICATION_TYPES.CONFIRM);
      if (!confirmed) return;
  
      try {
          const taskRef = tasksCollection.doc(taskId);
          await taskRef.update({
              isDeleted: true,
              deletedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          showNotification('Task deleted (moved to hidden).', NOTIFICATION_TYPES.SUCCESS);
      } catch (error) {
          console.error("Error soft deleting task: ", error);
          showNotification("Error deleting task. See console.", NOTIFICATION_TYPES.ERROR);
      }
  };
  
  // Core modal and CSV functions (openTaskModal, renderModalImagePreview, closeModal, saveTaskDetails, exportTasksToCsv)
  // remain identical to the previous full version. I'll put placeholders here for brevity.
  const openTaskModal = (t) => { /* ... IDENTICAL to previous ... */
      if(!modal){console.error("openTaskModal: elements N/A");return;} elementToFocusOnModalClose=document.activeElement;
      modalTaskId.value=t.id;modalTaskTitle.value=t.title;modalBenefitScore.value=t.benefitScore===0?'':t.benefitScore;modalComplexityScore.value=t.complexityScore===0?'':t.complexityScore;
      if(modalTaskStatus)modalTaskStatus.value=t.status;modalTaskTag.value=t.tag||'';modalTaskWho.value=t.who||'';modalTaskDetails.value=t.details||'';
      modalTaskImageUrls.value=(t.imageUrls&&Array.isArray(t.imageUrls))?t.imageUrls.join('\n'):'';renderModalImagePreview(t.imageUrls||[]);
      modal.style.display='block';autoResizeTextarea(modalTaskDetails);autoResizeTextarea(modalTaskImageUrls);if(modalTaskTitle)modalTaskTitle.focus();
  };
  const renderModalImagePreview = (urls) => { /* ... IDENTICAL to previous ... */
      if(!modalImagePreview){console.error("renderModalImagePreview: N/A");return;} modalImagePreview.innerHTML='';
      if(urls&&Array.isArray(urls)&&urls.length>0){urls.forEach(u=>{const tU=String(u).trim();if(tU==='')return;
      const i=document.createElement('img');i.src=tU;i.alt='Preview';i.onerror=()=>{i.style.display='none';const eT=document.createElement('span');eT.textContent=`(Fail: ${tU.slice(0,30)}...)`;eT.style.cssText='font-size:0.8em;color:red';if(i.parentNode)i.parentNode.insertBefore(eT,i.nextSibling);};modalImagePreview.appendChild(i);});}
  };
  const closeModal = () => { /* ... IDENTICAL to previous ... */
      if(!modal){console.error("closeModal: N/A");return;} modal.style.display='none';if(modalImagePreview)modalImagePreview.innerHTML='';
      if(modalTaskDetails)modalTaskDetails.style.height='auto';if(modalTaskImageUrls)modalTaskImageUrls.style.height='auto';
      if(elementToFocusOnModalClose){elementToFocusOnModalClose.focus();elementToFocusOnModalClose=null;}
  };
  const saveTaskDetails = async () => { /* ... IDENTICAL to previous ... */
      // Important: If a task is edited, ensure its isDeleted status isn't accidentally changed.
      // The current saveTaskDetails doesn't touch isDeleted, which is correct for this model.
      if(!modalTaskId){console.error("saveTaskDetails: N/A");return;} const id=modalTaskId.value;if(!id){showNotification('ID missing',NOTIFICATION_TYPES.ERROR);return;}
      const title=modalTaskTitle.value.trim();if(!title){showNotification('Title required',NOTIFICATION_TYPES.ERROR);modalTaskTitle.focus();return;}
      saveTaskDetailsBtn.disabled=true;saveTaskDetailsBtn.textContent='Saving...';const imgUrls=modalTaskImageUrls.value.split('\n').map(u=>u.trim()).filter(u=>u!=='');
      const bS=getValidatedScore(modalBenefitScore.value),cS=getValidatedScore(modalComplexityScore.value);const pS=calculatePriorityScore(bS,cS);
      const uD={title,benefitScore:bS,complexityScore:cS,priorityScore:pS,status:modalTaskStatus.value,tag:modalTaskTag.value.trim(),who:modalTaskWho.value.trim(),details:modalTaskDetails.value.trim(),imageUrls:imgUrls};
      // Crucially, we do NOT update `isDeleted` or `deletedAt` here, preserving its soft-delete status if it was restored and then edited.
      try{await tasksCollection.doc(id).update(uD);showNotification('Task saved',NOTIFICATION_TYPES.SUCCESS);closeModal();}
      catch(err){console.error("Save task error:",err);showNotification("Error saving",NOTIFICATION_TYPES.ERROR);}
      finally{if(saveTaskDetailsBtn){saveTaskDetailsBtn.disabled=false;saveTaskDetailsBtn.textContent='Save Changes';}}
  };
  const exportTasksToCsv = () => { /* ... IDENTICAL to previous ... */
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
  
  // --- Login/Logout Functions (Identical to previous) ---
  const handleLogin = async () => { /* ... IDENTICAL ... */
      if (!loginEmailInput || !loginPasswordInput || !loginButton || !loginErrorMessage) { console.error("Login form elements missing."); return; }
      const email = loginEmailInput.value; const password = loginPasswordInput.value;
      loginErrorMessage.textContent = ''; loginErrorMessage.style.display = 'none';
      loginButton.disabled = true; loginButton.textContent = 'Logging in...';
      try {
          await auth.signInWithEmailAndPassword(email, password);
      } catch (error) {
          console.error("Login failed:", error);
          loginErrorMessage.textContent = error.message;
          loginErrorMessage.style.display = 'block';
      } finally {
          if (loginButton) { loginButton.disabled = false; loginButton.textContent = 'Login'; }
      }
  };
  const handleLogout = async () => { /* ... IDENTICAL ... */
      try { await auth.signOut(); }
      catch (error) { console.error("Sign out error:", error); showNotification("Sign out error", NOTIFICATION_TYPES.ERROR); }
  };
  
  // --- Application Initialization & UI Management ---
  function initializeAppLogic(user) {
      if (appInitialized) { console.log("App already initialized for user:", user.uid); return; }
      console.log("initializeAppLogic called. User UID:", user.uid);
      appInitialized = true;
  
      // Assign main app DOM elements
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
  
      if (!taskTableBody || !addTaskBtn || !logoutButton) { console.error("Critical app DOM N/A."); return; }
  
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
      window.onclick=(e)=>{if(modal&&e.target===modal)closeModal();};
      window.onkeydown=(e)=>{if(modal&&e.key==='Escape'&&modal.style.display==='block')closeModal();};
  
      // Setup Firestore listener for ACTIVE TASKS ONLY
      console.log("Setting up Firestore listener for active tasks.");
      if (firestoreListenerUnsubscribe) firestoreListenerUnsubscribe();
  
      // Query for tasks that are NOT soft-deleted
      // This requires existing tasks to have isDeleted: false, or you need to handle older data.
      // New tasks created via addTask() will have isDeleted: false.
      firestoreListenerUnsubscribe = tasksCollection
          .where('isDeleted', '==', false) // Only fetch active tasks
          .orderBy('createdAt', 'desc')
          .onSnapshot(snapshot => {
              console.log("Active tasks data received. User:", auth.currentUser ? auth.currentUser.uid : "N/A");
              let tasksFromDb = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
              tasksFromDb.sort((a,b)=>{ /* ... Your existing sorting logic ... */
                  const iDA=a.status===TASK_STATUS.DONE,iDB=b.status===TASK_STATUS.DONE;if(iDA!==iDB)return iDA?1:-1;if(iDA&&iDB)return(b.createdAt?.toDate()?.getTime()||0)-(a.createdAt?.toDate()?.getTime()||0);const cA=getScoringCategory(a),cB=getScoringCategory(b);if(cA!==cB)return cB-cA;if(cA===2){const pA=a.priorityScore,pB=b.priorityScore;if(pA!==pB)return pB-pA;}return(b.createdAt?.toDate()?.getTime()||0)-(a.createdAt?.toDate()?.getTime()||0);
              });
              allFetchedTasks = tasksFromDb; // Store for CSV export
              renderTasks(allFetchedTasks); // Render only active tasks
              console.log("Active tasks fetched, sorted, and rendered.");
          }, error => {
              console.error("Firestore onSnapshot error (active tasks):", error);
              if (error.code === 'permission-denied') {
                  showNotification("PERMISSION DENIED fetching tasks.", NOTIFICATION_TYPES.ERROR, 10000);
              } else if (error.code === 'failed-precondition' && error.message.includes("index")) {
                  showNotification("Firestore query needs an index. Check console for link.", NOTIFICATION_TYPES.ERROR, 15000);
                  console.error("Firestore Index Creation Link:", error.message.substring(error.message.indexOf('https://')));
              } else {
                  showNotification("Error fetching tasks.", NOTIFICATION_TYPES.ERROR);
              }
          });
  }
  
  function updateLoginUI(user) { /* ... IDENTICAL to previous ... */
      if (!loginContainer) loginContainer = document.getElementById('loginContainer');
      if (!appContainer) appContainer = document.getElementById('appContainer');
      if (!loginButton) loginButton = document.getElementById('loginButton');
      if (!loginEmailInput) loginEmailInput = document.getElementById('loginEmail');
      if (!loginPasswordInput) loginPasswordInput = document.getElementById('loginPassword');
      if (!loginErrorMessage) loginErrorMessage = document.getElementById('loginErrorMessage');
  
      if (!loginContainer || !appContainer) { console.error("updateLoginUI: Login/App container N/A."); return; }
  
      if (user) {
          console.log("Auth state: User logged in. UID:", user.uid);
          loginContainer.style.display = 'none';
          appContainer.style.display = 'block';
          if (!appInitialized) initializeAppLogic(user);
      } else {
          console.log("Auth state: User logged out/no session.");
          loginContainer.style.display = 'block';
          appContainer.style.display = 'none';
          if (appInitialized) {
              if (firestoreListenerUnsubscribe) { console.log("Detaching Firestore listener."); firestoreListenerUnsubscribe(); firestoreListenerUnsubscribe = null; }
              if (taskTableBody) taskTableBody.innerHTML = '';
              allFetchedTasks = [];
              appInitialized = false;
          }
          if (loginButton && !loginButton.hasAttribute('data-listener-attached')) {
              loginButton.addEventListener('click', handleLogin);
              loginButton.setAttribute('data-listener-attached', 'true');
          } else if (loginButton && loginButton.hasAttribute('data-listener-attached')) {
              // Listener already there
          } else if (!loginButton) {
              console.error("Login button N/A when user logged out.");
          }
          if (loginErrorMessage) { loginErrorMessage.textContent = ''; loginErrorMessage.style.display = 'none'; }
          if (loginEmailInput) loginEmailInput.value = '';
          if (loginPasswordInput) loginPasswordInput.value = '';
      }
  }
  
  // --- Entry Point ---
  document.addEventListener('DOMContentLoaded', () => {
      console.log("DOM loaded. Initializing UI based on auth state.");
      loginContainer = document.getElementById('loginContainer'); // Ensure these are grabbed early
      appContainer = document.getElementById('appContainer');
      updateLoginUI(auth.currentUser); // Initial check
      auth.onAuthStateChanged(user => { // Subsequent changes
          console.log("auth.onAuthStateChanged fired. User:", user ? user.uid : "null");
          updateLoginUI(user);
      });
  });