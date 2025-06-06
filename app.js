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
  
  // DOM Elements - Declared globally, assigned after DOM ready / auth
  let taskTableBody, addTaskBtn, taskTitleInput, benefitScoreInput, complexityScoreInput,
      taskStatusInput, taskTagInput, taskWhoInput, modal, closeModalBtn, saveTaskDetailsBtn,
      modalTaskId, modalTaskTitle, modalBenefitScore, modalComplexityScore, modalTaskStatus,
      modalTaskTag, modalTaskDetails, modalTaskImageUrls, modalImagePreview, modalTaskWho,
      exportCsvButton, loginContainer, appContainer, loginEmailInput, loginPasswordInput,
      loginButton, loginErrorMessage, logoutButton;
  
  let elementToFocusOnModalClose = null;
  let allFetchedTasks = [];
  let appInitialized = false; // Tracks if main app logic has been initialized for the current session
  let firestoreListenerUnsubscribe = null;
  
  // --- Helper Functions ---
  const calculatePriorityScore = (benefit, complexity) => (Number(benefit) || 0) - (Number(complexity) || 0);
  
  const getScoringCategory = (task) => {
      const benefit = Number(task.benefitScore) || 0;
      const complexity = Number(task.complexityScore) || 0;
      if (benefit !== 0 && complexity !== 0) return 2;
      if (benefit !== 0 || complexity !== 0) return 1;
      return 0;
  };
  
  function autoResizeTextarea(element) {
      if (!element) return;
      element.style.height = "auto";
      element.style.height = (element.scrollHeight) + "px";
  }
  
  const showNotification = (message, type = NOTIFICATION_TYPES.INFO, duration = 3000) => {
      console.log(`NOTIFY (${type}): ${message}`);
      const el = document.createElement('div');
      el.className = `notification ${type}`;
      el.textContent = message;
      document.body.appendChild(el);
      setTimeout(() => el.classList.add('show'), 10);
      if (type === NOTIFICATION_TYPES.CONFIRM) {
          document.body.removeChild(el);
          return window.confirm(message);
      }
      setTimeout(() => {
          el.classList.remove('show');
          setTimeout(() => { if (document.body.contains(el)) document.body.removeChild(el); }, 300);
      }, duration);
  };
  
  const getStatusClass = (status) => ({
      [TASK_STATUS.TODO]: 'status-todo',
      [TASK_STATUS.IN_PROGRESS]: 'status-inprogress',
      [TASK_STATUS.PAUSED]: 'status-paused',
      [TASK_STATUS.DONE]: 'status-done'
  }[status] || '');
  
  const getValidatedScore = (inputValue) => {
      if (inputValue === '' || inputValue === null || typeof inputValue === 'undefined') return 0;
      let score = parseInt(inputValue, 10);
      if (isNaN(score)) return 0;
      if (score < 1) return 1;
      if (score > 10) return 10;
      return score;
  };
  
  const handleScoreInput = (event) => {
      const inputElement = event.target;
      let value = inputElement.value;
      if (value === '') return;
      let numValue = parseInt(value, 10);
      if (isNaN(numValue)) { inputElement.value = ''; return; }
      if (numValue > 10) inputElement.value = '10';
      else if (numValue < 1) inputElement.value = '1';
  };
  
  const statusOptions = [TASK_STATUS.TODO, TASK_STATUS.IN_PROGRESS, TASK_STATUS.PAUSED, TASK_STATUS.DONE];
  const populateStatusDropdown = (selectElement) => {
      if (!selectElement) return;
      selectElement.innerHTML = '';
      statusOptions.forEach(statusValue => {
          const option = document.createElement('option');
          option.value = statusValue;
          option.textContent = statusValue;
          selectElement.appendChild(option);
      });
  };
  
  function escapeCsvField(field) {
      if (field == null) return ''; // Handles both null and undefined
      let stringField = String(field);
      if (stringField.search(/("|,|\n)/g) >= 0) {
          stringField = '"' + stringField.replace(/"/g, '""') + '"';
      }
      return stringField;
  }
  
  // --- Core Functions ---
  const renderTasks = (tasksToRender) => {
      if (!taskTableBody) { console.error("renderTasks: taskTableBody not assigned or available."); return; }
      taskTableBody.innerHTML = '';
      if (tasksToRender.length === 0) {
          const r = taskTableBody.insertRow(), c = r.insertCell();
          c.colSpan = 8; c.textContent = 'No tasks yet. Add one above!'; c.style.textAlign = 'center';
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
          const actionsCell = row.insertCell(), deleteBtn = document.createElement('button');
          deleteBtn.textContent = 'Delete'; deleteBtn.className = 'action-btn delete-btn'; deleteBtn.type = 'button';
          deleteBtn.onclick = async (e) => { e.stopPropagation(); deleteBtn.disabled = true; deleteBtn.textContent = 'Deleting...'; await deleteTask(task.id); };
          actionsCell.appendChild(deleteBtn);
          const handleRowInteraction = () => openTaskModal(task);
          row.onclick = handleRowInteraction;
          row.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleRowInteraction(); } };
      });
  };
  
  const addTask = async () => {
      if (!taskTitleInput) { console.error("addTask: taskTitleInput not assigned."); return; }
      const title = taskTitleInput.value.trim();
      if (!title) { showNotification('Task Title is required!', NOTIFICATION_TYPES.ERROR); taskTitleInput.focus(); return; }
      if (addTaskBtn) { addTaskBtn.disabled = true; addTaskBtn.textContent = 'Adding...'; }
      const benefitScoreVal = getValidatedScore(benefitScoreInput.value);
      const complexityScoreVal = getValidatedScore(complexityScoreInput.value);
      const priorityScore = calculatePriorityScore(benefitScoreVal, complexityScoreVal);
      const newTask = {
          title, benefitScore: benefitScoreVal, complexityScore: complexityScoreVal, priorityScore,
          status: taskStatusInput.value, tag: taskTagInput.value.trim(), who: taskWhoInput.value.trim(),
          details: '', imageUrls: [], createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      try {
          await tasksCollection.add(newTask);
          showNotification('Task added successfully!', NOTIFICATION_TYPES.SUCCESS);
          taskTitleInput.value = ''; benefitScoreInput.value = ''; complexityScoreInput.value = '';
          if (taskStatusInput) taskStatusInput.value = TASK_STATUS.TODO;
          taskTagInput.value = ''; taskWhoInput.value = '';
          taskTitleInput.focus();
      } catch (error) {
          console.error("Error adding task: ", error);
          showNotification("Error adding task. See console for details.", NOTIFICATION_TYPES.ERROR);
      } finally {
          if (addTaskBtn) { addTaskBtn.disabled = false; addTaskBtn.textContent = 'Add Task'; }
      }
  };
  
  const deleteTask = async (taskId) => {
      const confirmed = showNotification('Are you sure you want to delete this task?', NOTIFICATION_TYPES.CONFIRM);
      if (!confirmed) return;
      try {
          await tasksCollection.doc(taskId).delete();
          showNotification('Task deleted successfully!', NOTIFICATION_TYPES.SUCCESS);
      } catch (error) {
          console.error("Error deleting task: ", error);
          showNotification("Error deleting task. See console for details.", NOTIFICATION_TYPES.ERROR);
          if (taskTableBody) {
              const rowWithError = taskTableBody.querySelector(`tr[data-id="${taskId}"]`);
              if (rowWithError) { const btn = rowWithError.querySelector('.delete-btn'); if (btn) { btn.disabled = false; btn.textContent = 'Delete'; } }
          }
      }
  };
  
  const openTaskModal = (task) => {
      if (!modal) { console.error("openTaskModal: modal element not assigned."); return; }
      elementToFocusOnModalClose = document.activeElement;
      modalTaskId.value = task.id; modalTaskTitle.value = task.title;
      modalBenefitScore.value = task.benefitScore === 0 ? '' : task.benefitScore;
      modalComplexityScore.value = task.complexityScore === 0 ? '' : task.complexityScore;
      if (modalTaskStatus) modalTaskStatus.value = task.status;
      modalTaskTag.value = task.tag || ''; modalTaskWho.value = task.who || '';
      modalTaskDetails.value = task.details || '';
      modalTaskImageUrls.value = (task.imageUrls && Array.isArray(task.imageUrls)) ? task.imageUrls.join('\n') : '';
      renderModalImagePreview(task.imageUrls || []);
      modal.style.display = 'block';
      autoResizeTextarea(modalTaskDetails); autoResizeTextarea(modalTaskImageUrls);
      if (modalTaskTitle) modalTaskTitle.focus();
  };
  
  const renderModalImagePreview = (urls) => {
      if (!modalImagePreview) { console.error("renderModalImagePreview: modalImagePreview not assigned."); return; }
      modalImagePreview.innerHTML = '';
      if (urls && Array.isArray(urls) && urls.length > 0) {
          urls.forEach(url => {
              const trimmedUrl = String(url).trim();
              if (trimmedUrl === '') return;
              const img = document.createElement('img'); img.src = trimmedUrl; img.alt = 'Task Image Preview';
              img.onerror = () => {
                  img.style.display = 'none'; const errorText = document.createElement('span');
                  errorText.textContent = ` (Image failed: ${trimmedUrl.substring(0, 30)}...)`;
                  errorText.style.cssText = 'font-size:0.8em;color:red;display:block;'; // Make it visible
                  if (img.parentNode) img.parentNode.insertBefore(errorText, img.nextSibling);
              };
              modalImagePreview.appendChild(img);
          });
      }
  };
  
  const closeModal = () => {
      if (!modal) { console.error("closeModal: modal element not assigned."); return; }
      modal.style.display = 'none';
      if (modalImagePreview) modalImagePreview.innerHTML = '';
      if (modalTaskDetails) modalTaskDetails.style.height = 'auto';
      if (modalTaskImageUrls) modalTaskImageUrls.style.height = 'auto';
      if (elementToFocusOnModalClose) { elementToFocusOnModalClose.focus(); elementToFocusOnModalClose = null; }
  };
  
  const saveTaskDetails = async () => {
      if (!modalTaskId || !modalTaskTitle || !saveTaskDetailsBtn) { console.error("saveTaskDetails: core modal elements not assigned."); return; }
      const taskId = modalTaskId.value;
      if (!taskId) { showNotification("Error: Task ID missing.", NOTIFICATION_TYPES.ERROR); return; }
      const title = modalTaskTitle.value.trim();
      if (!title) { showNotification('Task Title cannot be empty!', NOTIFICATION_TYPES.ERROR); modalTaskTitle.focus(); return; }
      saveTaskDetailsBtn.disabled = true; saveTaskDetailsBtn.textContent = 'Saving...';
      const imageUrls = modalTaskImageUrls.value.split('\n').map(url => url.trim()).filter(url => url !== '');
      const benefitScoreVal = getValidatedScore(modalBenefitScore.value);
      const complexityScoreVal = getValidatedScore(modalComplexityScore.value);
      const priorityScore = calculatePriorityScore(benefitScoreVal, complexityScoreVal);
      const updatedData = {
          title, benefitScore: benefitScoreVal, complexityScore: complexityScoreVal, priorityScore,
          status: modalTaskStatus.value, tag: modalTaskTag.value.trim(), who: modalTaskWho.value.trim(),
          details: modalTaskDetails.value.trim(), imageUrls
      };
      try {
          await tasksCollection.doc(taskId).update(updatedData);
          showNotification('Task details saved!', NOTIFICATION_TYPES.SUCCESS); closeModal();
      } catch (error) {
          console.error("Error updating task: ", error);
          showNotification("Error updating task. See console for details.", NOTIFICATION_TYPES.ERROR);
      } finally {
          if (saveTaskDetailsBtn) { saveTaskDetailsBtn.disabled = false; saveTaskDetailsBtn.textContent = 'Save Changes'; }
      }
  };
  
  const exportTasksToCsv = () => {
      if (!allFetchedTasks || allFetchedTasks.length === 0) { showNotification("No tasks to export.", NOTIFICATION_TYPES.INFO); return; }
      const headers = ["Rank", "Title", "Benefit Score", "Complexity Score", "Status", "Tag", "Who", "Details", "Image URLs (joined by ';')"];
      let csvContent = headers.join(",") + "\n";
      allFetchedTasks.forEach((task, index) => {
          const imageUrlsString = (task.imageUrls && Array.isArray(task.imageUrls)) ? task.imageUrls.join('; ') : '';
          const row = [
              index + 1, task.title, task.benefitScore === 0 ? '' : task.benefitScore,
              task.complexityScore === 0 ? '' : task.complexityScore, task.status,
              task.tag || '', task.who || '', task.details || '', imageUrlsString
          ];
          csvContent += row.map(field => escapeCsvField(field)).join(",") + "\n";
      });
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      if (link.download !== undefined) {
          const url = URL.createObjectURL(blob);
          link.setAttribute("href", url); link.setAttribute("download", "tasks-export.csv");
          link.style.visibility = 'hidden'; document.body.appendChild(link);
          link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
      } else {
          showNotification("CSV export not supported by your browser.", NOTIFICATION_TYPES.ERROR);
      }
  };
  
  // --- Login/Logout Functions ---
  const handleLogin = async () => {
      if (!loginEmailInput || !loginPasswordInput || !loginButton || !loginErrorMessage) {
          console.error("Login form elements not assigned or available for handleLogin."); return;
      }
      const email = loginEmailInput.value; const password = loginPasswordInput.value;
      loginErrorMessage.textContent = ''; loginErrorMessage.style.display = 'none';
      loginButton.disabled = true; loginButton.textContent = 'Logging in...';
      try {
          await auth.signInWithEmailAndPassword(email, password);
          // onAuthStateChanged will handle UI update
          console.log("signInWithEmailAndPassword successful for:", email);
      } catch (error) {
          console.error("Login failed via signInWithEmailAndPassword:", error);
          loginErrorMessage.textContent = error.message;
          loginErrorMessage.style.display = 'block';
      } finally {
          if (loginButton) { loginButton.disabled = false; loginButton.textContent = 'Login'; }
      }
  };
  
  const handleLogout = async () => {
      try {
          await auth.signOut();
          console.log("User explicitly signed out via handleLogout.");
          // onAuthStateChanged will handle UI update
      } catch (error) {
          console.error("Sign out error:", error);
          showNotification("Error signing out: " + error.message, NOTIFICATION_TYPES.ERROR);
      }
  };
  
  // --- Application Initialization & UI Management ---
  function initializeAppLogic(user) {
      if (appInitialized) {
          console.log("initializeAppLogic: App already initialized for user:", user ? user.uid : "unknown", ". Skipping re-initialization.");
          return;
      }
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
  
      if (!taskTableBody || !addTaskBtn || !logoutButton /* Check other critical elements */) {
          console.error("Critical app DOM elements missing in initializeAppLogic. UI setup might be incomplete.");
          // Potentially show an error to the user if essential parts are missing
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
      
      window.onclick = (e) => { if (modal && e.target === modal) closeModal(); };
      window.onkeydown = (e) => { if (modal && e.key === 'Escape' && modal.style.display === 'block') closeModal(); };
  
      console.log("Setting up Firestore onSnapshot listener in initializeAppLogic for user:", user.uid);
      if (firestoreListenerUnsubscribe) {
          console.log("Detaching existing Firestore listener before attaching new one.");
          firestoreListenerUnsubscribe();
      }
      firestoreListenerUnsubscribe = tasksCollection.orderBy('createdAt', 'desc')
          .onSnapshot(snapshot => {
              console.log("Firestore data received. User authenticated:", auth.currentUser ? auth.currentUser.uid : "No current user (should not happen here!)");
              let tasksFromDb = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
              tasksFromDb.sort((a,b)=>{const iDA=a.status===TASK_STATUS.DONE,iDB=b.status===TASK_STATUS.DONE;if(iDA!==iDB)return iDA?1:-1;if(iDA&&iDB)return(b.createdAt?.toDate()?.getTime()||0)-(a.createdAt?.toDate()?.getTime()||0);const cA=getScoringCategory(a),cB=getScoringCategory(b);if(cA!==cB)return cB-cA;if(cA===2){const pA=a.priorityScore,pB=b.priorityScore;if(pA!==pB)return pB-pA;}return(b.createdAt?.toDate()?.getTime()||0)-(a.createdAt?.toDate()?.getTime()||0);});
              allFetchedTasks = tasksFromDb;
              renderTasks(allFetchedTasks);
              console.log("Tasks successfully fetched, sorted, and rendered.");
          }, error => {
              console.error("Firestore onSnapshot error (logged in):", error);
              if (error.code === 'permission-denied' || (error.name && error.name.includes("FirebaseError") && error.message && error.message.toLowerCase().includes("permission denied"))) {
                  showNotification("PERMISSION DENIED fetching tasks. Your session might be invalid. Please try logging out and back in.", NOTIFICATION_TYPES.ERROR, 10000);
                  console.error("Current auth state on permission error:", auth.currentUser ? `User UID: ${auth.currentUser.uid}` : "No user authenticated");
                  // Consider logging the user out if permission is denied persistently
                  // auth.signOut(); 
              } else {
                  showNotification("Error fetching tasks. See console.", NOTIFICATION_TYPES.ERROR);
              }
          });
  }
  
  function updateLoginUI(user) {
      // These are only needed here, ensure they are fetched once after DOM ready.
      if (!loginContainer) loginContainer = document.getElementById('loginContainer');
      if (!appContainer) appContainer = document.getElementById('appContainer');
      if (!loginButton) loginButton = document.getElementById('loginButton');
      if (!loginEmailInput) loginEmailInput = document.getElementById('loginEmail');
      if (!loginPasswordInput) loginPasswordInput = document.getElementById('loginPassword');
      if (!loginErrorMessage) loginErrorMessage = document.getElementById('loginErrorMessage');
  
      if (!loginContainer || !appContainer) {
          console.error("updateLoginUI: Login or App container not found in DOM. Cannot update UI.");
          return;
      }
  
      if (user) {
          console.log("Auth state: User logged in (UID:", user.uid, "). Showing app container.");
          loginContainer.style.display = 'none';
          appContainer.style.display = 'block';
          if (!appInitialized) { // Only initialize the main app logic once per valid user session
              initializeAppLogic(user);
          }
      } else {
          console.log("Auth state: User logged out or no user session. Showing login form.");
          loginContainer.style.display = 'block';
          appContainer.style.display = 'none';
          if (appInitialized) { // If app was initialized, clean up
              if (firestoreListenerUnsubscribe) {
                  console.log("Detaching Firestore listener due to logout/no user.");
                  firestoreListenerUnsubscribe();
                  firestoreListenerUnsubscribe = null;
              }
              if (taskTableBody) taskTableBody.innerHTML = ''; // Clear tasks from display
              allFetchedTasks = [];
              appInitialized = false; // Reset flag
          }
  
          // Ensure login button listener is attached (only once)
          if (loginButton && !loginButton.hasAttribute('data-listener-attached')) {
              loginButton.addEventListener('click', handleLogin);
              loginButton.setAttribute('data-listener-attached', 'true');
              console.log("Login button listener attached.");
          } else if (loginButton && loginButton.hasAttribute('data-listener-attached')) {
              console.log("Login button listener already attached.");
          } else if (!loginButton) {
              console.error("Login button not found in updateLoginUI when user is logged out.");
          }
          
          // Clear login form fields and error messages
          if (loginErrorMessage) { loginErrorMessage.textContent = ''; loginErrorMessage.style.display = 'none'; }
          if (loginEmailInput) loginEmailInput.value = '';
          if (loginPasswordInput) loginPasswordInput.value = '';
      }
  }
  
  // --- Entry Point: Listen for DOM ready, then set up Auth Listener ---
  document.addEventListener('DOMContentLoaded', () => {
      console.log("DOM fully loaded and parsed. Setting up auth state listener and initial UI check.");
  
      // Get references to containers once DOM is ready.
      // Specific form elements will be fetched inside updateLoginUI or initializeAppLogic as needed.
      loginContainer = document.getElementById('loginContainer');
      appContainer = document.getElementById('appContainer');
  
      // Initial UI state based on current Firebase auth session (e.g. if user is already logged in)
      // This handles the case where a user might already have a valid session when the page loads.
      updateLoginUI(auth.currentUser);
  
      // Listen for subsequent auth state changes (login, logout)
      auth.onAuthStateChanged(user => {
          console.log("auth.onAuthStateChanged event fired. New user state:", user ? `UID: ${user.uid}` : "null (signed out)");
          updateLoginUI(user);
      });
  });