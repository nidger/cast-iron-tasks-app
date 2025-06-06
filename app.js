// Your web app's Firebase configuration
// !! WARNING: Your API key is visible here. RESTRICT IT IN GOOGLE CLOUD CONSOLE. !!
// !! Ensure your Firebase Security Rules are set up in the Firebase Console.   !!
const firebaseConfig = {
    apiKey: "AIzaSyAqWtjDMQkvzSjC3JmcRYfuMP_VfU3-_E8", // Your actual API key - RESTRICT IT!
    authDomain: "cast-iron-tasks.firebaseapp.com",
    projectId: "cast-iron-tasks", // Your actual Project ID
    storageBucket: "cast-iron-tasks.firebasestorage.app",
    messagingSenderId: "742460863108",
    appId: "1:742460863108:web:af3fd7ec7f746dd8a948d1"
  };
  
  /*
  --------------------------------------------------------------------------------
    IMPORTANT: FIREBASE SECURITY RULES (Set these in Firebase Console > Firestore Database > Rules)
    You should have updated your rules to something like:
    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents {
        match /tasks/{taskId} {
          allow read, write: if request.auth != null;
        }
      }
    }
  --------------------------------------------------------------------------------
  */
  
  // Initialize Firebase
  firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore(); // Firestore instance
  const auth = firebase.auth();   // Auth instance
  const tasksCollection = db.collection('tasks');
  
  // --- Constants ---
  const TASK_STATUS = {
      TODO: 'To Do',
      IN_PROGRESS: 'In Progress',
      PAUSED: 'Paused',
      DONE: 'Done'
  };
  const NOTIFICATION_TYPES = {
      INFO: 'info',
      SUCCESS: 'success',
      ERROR: 'error',
      CONFIRM: 'confirm'
  };
  
  // DOM Elements - Declare globally with 'let', will be assigned in initializeAppLogic
  let taskTableBody, addTaskBtn, taskTitleInput, benefitScoreInput, complexityScoreInput,
      taskStatusInput, taskTagInput, taskWhoInput, modal, closeModalBtn, saveTaskDetailsBtn,
      modalTaskId, modalTaskTitle, modalBenefitScore, modalComplexityScore, modalTaskStatus,
      modalTaskTag, modalTaskDetails, modalTaskImageUrls, modalImagePreview, modalTaskWho,
      exportCsvButton;
  
  let elementToFocusOnModalClose = null;
  let allFetchedTasks = []; // Array to store tasks for CSV export and rendering
  
  // --- Helper Functions ---
  const calculatePriorityScore = (benefit, complexity) => {
      const ben = Number(benefit) || 0;
      const com = Number(complexity) || 0;
      return ben - com;
  };
  
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
      console.log(`Notification (${type}): ${message}`);
      const notificationElement = document.createElement('div');
      notificationElement.className = `notification ${type}`;
      notificationElement.textContent = message;
      document.body.appendChild(notificationElement);
      setTimeout(() => notificationElement.classList.add('show'), 10);
  
      if (type === NOTIFICATION_TYPES.CONFIRM) {
          document.body.removeChild(notificationElement);
          return window.confirm(message);
      }
      setTimeout(() => {
          notificationElement.classList.remove('show');
          setTimeout(() => {
              if (document.body.contains(notificationElement)) {
                  document.body.removeChild(notificationElement);
              }
          }, 300);
      }, duration);
  };
  
  const getStatusClass = (status) => {
      switch (status) {
          case TASK_STATUS.TODO: return 'status-todo';
          case TASK_STATUS.IN_PROGRESS: return 'status-inprogress';
          case TASK_STATUS.PAUSED: return 'status-paused';
          case TASK_STATUS.DONE: return 'status-done';
          default: return '';
      }
  };
  
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
      if (selectElement) {
          selectElement.innerHTML = '';
          statusOptions.forEach(statusValue => {
              const option = document.createElement('option');
              option.value = statusValue; option.textContent = statusValue;
              selectElement.appendChild(option);
          });
      } else {
          // console.error("populateStatusDropdown: selectElement is NULL. This might be okay if called before DOM ready.");
      }
  };
  
  function escapeCsvField(field) {
      if (field === null || typeof field === 'undefined') return '';
      let stringField = String(field);
      if (stringField.search(/("|,|\n)/g) >= 0) {
          stringField = '"' + stringField.replace(/"/g, '""') + '"';
      }
      return stringField;
  }
  
  // --- Core Functions Definitions (must be defined before being called in initializeAppLogic) ---
  const renderTasks = (tasksToRender) => {
      if (!taskTableBody) { console.error("renderTasks: taskTableBody is not yet available."); return; }
      taskTableBody.innerHTML = '';
      if (tasksToRender.length === 0) {
          const row = taskTableBody.insertRow(); const cell = row.insertCell();
          cell.colSpan = 8; cell.textContent = 'No tasks yet. Add one above!'; cell.style.textAlign = 'center';
          return;
      }
      tasksToRender.forEach((task, index) => {
          const row = taskTableBody.insertRow();
          row.setAttribute('data-id', task.id); row.setAttribute('tabindex', '0');
          if (task.status === TASK_STATUS.DONE) row.classList.add('task-done');
          row.insertCell().textContent = index + 1; row.insertCell().textContent = task.title;
          row.insertCell().textContent = task.benefitScore === 0 ? '' : task.benefitScore;
          row.insertCell().textContent = task.complexityScore === 0 ? '' : task.complexityScore;
          const statusCell = row.insertCell(); const statusSpan = document.createElement('span');
          statusSpan.textContent = task.status; statusSpan.classList.add('status-badge', getStatusClass(task.status));
          statusCell.appendChild(statusSpan);
          row.insertCell().textContent = task.tag || ''; row.insertCell().textContent = task.who || '';
          const actionsCell = row.insertCell(); const deleteBtn = document.createElement('button');
          deleteBtn.textContent = 'Delete'; deleteBtn.classList.add('action-btn', 'delete-btn'); deleteBtn.type = 'button';
          deleteBtn.onclick = async (e) => { e.stopPropagation(); deleteBtn.disabled = true; deleteBtn.textContent = 'Deleting...'; await deleteTask(task.id); };
          actionsCell.appendChild(deleteBtn);
          const handleRowInteraction = () => openTaskModal(task);
          row.addEventListener('click', handleRowInteraction);
          row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleRowInteraction(); } });
      });
  };
  
  const addTask = async () => {
      if (!taskTitleInput) { console.error("addTask: Form elements not ready."); return; }
      const title = taskTitleInput.value.trim();
      if (!title) { showNotification('Task Title is required!', NOTIFICATION_TYPES.ERROR); taskTitleInput.focus(); return; }
      addTaskBtn.disabled = true; addTaskBtn.textContent = 'Adding...';
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
          taskStatusInput.value = TASK_STATUS.TODO; taskTagInput.value = ''; taskWhoInput.value = '';
          taskTitleInput.focus();
      } catch (error) {
          console.error("Error adding task: ", error);
          showNotification("Error adding task. See console for details.", NOTIFICATION_TYPES.ERROR);
      } finally {
          addTaskBtn.disabled = false; addTaskBtn.textContent = 'Add Task';
      }
  };
  
  const deleteTask = async (taskId) => {
      const confirmed = showNotification('Are you sure you want to delete this task?', NOTIFICATION_TYPES.CONFIRM);
      if (confirmed) {
          try { await tasksCollection.doc(taskId).delete(); showNotification('Task deleted successfully!', NOTIFICATION_TYPES.SUCCESS); }
          catch (error) {
              console.error("Error deleting task: ", error);
              showNotification("Error deleting task. See console for details.", NOTIFICATION_TYPES.ERROR);
              if (taskTableBody) {
                  const rowWithError = taskTableBody.querySelector(`tr[data-id="${taskId}"]`);
                  if (rowWithError) { const btn = rowWithError.querySelector('.delete-btn'); if (btn) { btn.disabled = false; btn.textContent = 'Delete'; } }
              }
          }
      }
  };
  
  const openTaskModal = (task) => {
      if (!modal) { console.error("openTaskModal: Modal elements not ready."); return; }
      elementToFocusOnModalClose = document.activeElement;
      modalTaskId.value = task.id; modalTaskTitle.value = task.title;
      modalBenefitScore.value = task.benefitScore === 0 ? '' : task.benefitScore;
      modalComplexityScore.value = task.complexityScore === 0 ? '' : task.complexityScore;
      modalTaskStatus.value = task.status; modalTaskTag.value = task.tag || ''; modalTaskWho.value = task.who || '';
      modalTaskDetails.value = task.details || '';
      modalTaskImageUrls.value = (task.imageUrls && Array.isArray(task.imageUrls)) ? task.imageUrls.join('\n') : '';
      renderModalImagePreview(task.imageUrls || []);
      modal.style.display = 'block';
      autoResizeTextarea(modalTaskDetails); autoResizeTextarea(modalTaskImageUrls);
      modalTaskTitle.focus();
  };
  
  const renderModalImagePreview = (urls) => {
      if (!modalImagePreview) { console.error("renderModalImagePreview: modalImagePreview not ready."); return; }
      modalImagePreview.innerHTML = '';
      if (urls && Array.isArray(urls) && urls.length > 0) {
          urls.forEach(url => {
              const trimmedUrl = String(url).trim(); // Ensure url is a string
              if (trimmedUrl !== '') {
                  const img = document.createElement('img'); img.src = trimmedUrl; img.alt = 'Task Image Preview';
                  img.onerror = () => {
                      img.style.display = 'none'; const errorText = document.createElement('span');
                      errorText.textContent = ` (Image failed: ${trimmedUrl.substring(0,30)}...)`;
                      errorText.style.fontSize = '0.8em'; errorText.style.color = 'red';
                      if (img.parentNode) img.parentNode.insertBefore(errorText, img.nextSibling);
                  };
                  modalImagePreview.appendChild(img);
              }
          });
      }
  };
  
  const closeModal = () => {
      if (!modal) { console.error("closeModal: Modal element not ready."); return; }
      modal.style.display = 'none';
      if (modalImagePreview) modalImagePreview.innerHTML = '';
      if(modalTaskDetails) modalTaskDetails.style.height = 'auto';
      if(modalTaskImageUrls) modalTaskImageUrls.style.height = 'auto';
      if (elementToFocusOnModalClose) { elementToFocusOnModalClose.focus(); elementToFocusOnModalClose = null; }
  };
  
  const saveTaskDetails = async () => {
      if (!modalTaskId) { console.error("saveTaskDetails: Modal elements not ready."); return; }
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
          showNotification('Task updated successfully!', NOTIFICATION_TYPES.SUCCESS); closeModal();
      } catch (error) {
          console.error("Error updating task: ", error);
          showNotification("Error updating task. See console for details.", NOTIFICATION_TYPES.ERROR);
      } finally {
          saveTaskDetailsBtn.disabled = false; saveTaskDetailsBtn.textContent = 'Save Changes';
      }
  };
  
  const exportTasksToCsv = () => {
      if (!allFetchedTasks || allFetchedTasks.length === 0) {
          showNotification("No tasks to export.", NOTIFICATION_TYPES.INFO); return;
      }
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
  
  
  // --- Anonymous Authentication and App Initialization ---
  auth.signInAnonymously()
    .then(() => {
      console.log('User signed in anonymously');
      initializeAppLogic(); // Initialize app after successful anonymous sign-in
    })
    .catch((error) => {
      console.error('Anonymous sign-in failed:', error);
      if (document.body) {
          document.body.innerHTML = `
              <div style="padding: 20px; text-align: center; font-family: sans-serif;">
                  <h1>Application Error</h1>
                  <p>Could not authenticate with the service. Please try refreshing the page.</p>
                  <p>If the problem persists, please contact support.</p>
                  <p><em>Error details (for debugging): ${error.message}</em></p>
              </div>
          `;
      }
    });
  
  function initializeAppLogic() {
      console.log("Initializing application logic after anonymous sign-in.");
  
      // Assign DOM elements (now that DOM is ready and auth is complete)
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
  
      // Populate dropdowns
      if (taskStatusInput) {
          populateStatusDropdown(taskStatusInput);
          taskStatusInput.value = TASK_STATUS.TODO; // Set default after populating
      } else {
          console.error("#taskStatus (Add Form) not found in initializeAppLogic");
      }
      if (modalTaskStatus) {
          populateStatusDropdown(modalTaskStatus);
      } else {
          console.error("#modalTaskStatus (Modal Form) not found in initializeAppLogic");
      }
  
      // Attach event listeners
      if (addTaskBtn) addTaskBtn.addEventListener('click', addTask);
      if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
      if (saveTaskDetailsBtn) saveTaskDetailsBtn.addEventListener('click', saveTaskDetails);
      if (exportCsvButton) exportCsvButton.addEventListener('click', exportTasksToCsv);
  
      if (benefitScoreInput) benefitScoreInput.addEventListener('input', handleScoreInput);
      if (complexityScoreInput) complexityScoreInput.addEventListener('input', handleScoreInput);
      if (modalBenefitScore) modalBenefitScore.addEventListener('input', handleScoreInput);
      if (modalComplexityScore) modalComplexityScore.addEventListener('input', handleScoreInput);
  
      if (modalTaskDetails) modalTaskDetails.addEventListener('input', function() { autoResizeTextarea(this); });
      if (modalTaskImageUrls) {
          modalTaskImageUrls.addEventListener('input', function() {
              autoResizeTextarea(this);
              const urls = this.value.split('\n').map(url => url.trim()).filter(url => url);
              renderModalImagePreview(urls);
          });
      }
  
      window.onclick = (event) => { if (modal && event.target == modal) closeModal(); };
      window.addEventListener('keydown', (event) => {
          if (modal && event.key === 'Escape' && modal.style.display === 'block') closeModal();
      });
  
      // Firestore listener for real-time updates
      tasksCollection
          .orderBy('createdAt', 'desc')
          .onSnapshot(snapshot => {
              let tasksFromDb = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
              tasksFromDb.sort((a, b) => {
                const isDoneA = a.status === TASK_STATUS.DONE; const isDoneB = b.status === TASK_STATUS.DONE;
                if (isDoneA !== isDoneB) return isDoneA ? 1 : -1;
                if (isDoneA && isDoneB) return (b.createdAt?.toDate()?.getTime() || 0) - (a.createdAt?.toDate()?.getTime() || 0);
                const categoryA = getScoringCategory(a); const categoryB = getScoringCategory(b);
                if (categoryA !== categoryB) return categoryB - categoryA;
                if (categoryA === 2) {
                    const priorityA = a.priorityScore; const priorityB = b.priorityScore;
                    if (priorityA !== priorityB) return priorityB - priorityA;
                }
                return (b.createdAt?.toDate()?.getTime() || 0) - (a.createdAt?.toDate()?.getTime() || 0);
              });
              allFetchedTasks = tasksFromDb;
              renderTasks(allFetchedTasks);
              console.log("Tasks successfully fetched (anonymously authenticated), sorted, and stored for export.");
          }, error => {
              console.error("Error fetching tasks (anonymously authenticated): ", error);
              if (error.code === 'permission-denied') {
                  showNotification("Permission denied fetching tasks. Firestore rules may need adjustment or auth failed.", NOTIFICATION_TYPES.ERROR, 7000);
              } else {
                  let userMessage = "Error fetching tasks. See console.";
                  if (error.code === 'failed-precondition' && error.message.includes("index")) {
                      userMessage = "Firestore needs an index. Check console for link, then refresh.";
                      console.log("Firestore index link:", error.message.substring(error.message.indexOf('https://')));
                  } else if (error.code === 'unavailable') {
                      userMessage = "Could not connect to Firestore. Check connection/Firebase.";
                  }
                  showNotification(userMessage, NOTIFICATION_TYPES.ERROR, 5000);
              }
          });
  }