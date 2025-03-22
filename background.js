
function authenticateUser() {
    // Request an OAuth token using chrome.identity API
    // Handle authentication success or failure
    chrome.identity.getAuthToken({interactive: true}, (token) => {
        if (chrome.runtime.lastError){
            console.error("Authenication Failed: ", chrome.runtime.lastError);
        } else {
            console.log("Authenication Successful: ", token);
        }
    });
}

function getAccessToken() {
    // Check if a token already exists
    // If not, request a new token using authenticateUser()
    // Return the access token for future API requests
    console.log("Checking for existing access token");

    return new Promise((resolve, reject) => {chrome.identity.getAuthToken({ interactive: false }, (token) => {
            if (chrome.runtime.lastError) {
                console.error("Error retrieving token:", chrome.runtime.lastError);
                token = authenticateUser();
                console.log("Access token retrieved:", token);
                reject(chrome.runtime.lastError);
            } else {
                console.log("Access token retrieved:", token);
                resolve(token);
            }
        });
    });
}

// find and store the job app in the local storage
// DOES NOT ADD THE PROPERITIES OF THE JOB APP IN THIS
function storeJobApplication(JobApplication){
    //checking if the job application is in the storage
    chrome.storage.local.get(JobApplication.id, function(result){
        if(Object.keys(result).length === 0) {
            chrome.storage.local.set({[JobApplication.id]: JobApplication}, function() {
                console.log("Job log:", JobApplication.id);
                updateJobApplicationIndex(JobApplication.id);
            });
        } else {
            const exisiting = result[JobApplication.id];
            if (JSON.stringify(exisiting) !== JSON.stringify(JobApplication)){
                JobApplication.lastUpdate = new Date().toISOString;
                chrome.storage.local.set({[JobApplication.id]: JobApplication}, function(){
                    console.log("Update the JobApplication Time:", JobApplication.lastUpdate);
                });
            } else {
                console.log("No Update to:", JobApplication);
            }
        }
    });
}

//takse the job id and update the list
function updateJobApplicationIndex(jobid){
    chrome.storage.local.get('JobApplicationIndex', function(result){
        let index = result.JobApplicationIndex || [];
        if (!index.includes(jobid)){
            index.push(jobid);
            chrome.storage.local.set({'JobApplicationIndex': index}, function(){
                console.log('Job application index updated to', index.length);
            });
        }
    });
}

function delay(time){
    return new Promise(resolve => setTimeout(resolve, time));
}

function processMessages(messages, token, index, emailNum){
    // If we've processed all messages, return
    if (index >= messages.length) {
        console.log("Finished processing all emails");
        return;
    }
    
    // Get the current message ID
    const messageId = messages[index].id;
    
    // Wait before fetching the next message to avoid rate limiting
    setTimeout(() => {
        // Fetch the full message details
        fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
            },
        })
        .then(response => {
            // Check for rate limiting
            if (response.status === 429) {
                console.log("Rate limit hit (429 error). Waiting longer before retry...");
                // Wait for 5 seconds before trying the same message again
                setTimeout(() => {
                    processMessages(messages, token, index, emailNum);
                }, 5000);
                return null;
            }
            return response.json();
        })
        .then(fullMessage => {
            // Skip if this was a rate-limited response
            if (!fullMessage) return;

            const jobApplication = {
                id : fullMessage.id,
                subject : fullMessage.payload.headers.find(header => header.name === "Subject")?.value || "No Subject",
                sender : fullMessage.payload.headers.find(header => header.name === "From")?.value || "Unknown Sender",
                date : new Date(fullMessage.payload.headers.find(header => header.name === "Date")?.value || Date.now()).toISOString(),
                lastUpdate: new Date(fullMessage.payload.headers.find(header => header.name === "Date")?.value || Date.now()).toISOString(),
                state: fullMessage
            }

            // Extract and log email details
            const subject = fullMessage.payload.headers.find(header => header.name === "Subject")?.value;
            const sender = fullMessage.payload.headers.find(header => header.name === "From")?.value;
            const date = fullMessage.payload.headers.find(header => header.name === "Date")?.value;
            
            console.log('Email Number:', emailNum);
            console.log('Subject:', subject);
            console.log('Sender:', sender);
            console.log('Date:', date);
            
            // Move to the next message after a delay
            setTimeout(() => {
                processMessages(messages, token, index + 1, emailNum + 1);
            }, 3000); // 3 second delay between messages
        })
        .catch(error => {
            console.error(`Error fetching details for message ${messageId}:`, error);
            // Continue with next message even after an error
            setTimeout(() => {
                processMessages(messages, token, index + 1, emailNum);
            }, 3000);
        });
    }, 2000); // Initial 2 second delay
}

function fetchEmails() {
    // Call getAccessToken() to retrieve a valid token
    // Use the token to send a request to the Gmail API
    // Retrieve job application emails

    getAccessToken().then(token => {
        let emailNum = 0;
        console.log("Using token: ", token);

        fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?q=job+application", {
            headers: { Authorization: `Bearer ${token}` }
        })
        //convert to json
        .then(response => response.json())
        .then(data => {
            console.log("Gmail API response:", data);
            //check if there is a message
            if (data.messages && data.messages.length > 0) {
                processMessages(data.messages, token, 0, emailNum);
              } else {
                console.log('No messages found.');
              }
            })
        .catch(error => {
            console.error("Error fetching emails:", error);
        });
    }).catch(error => {
        console.error("Token retrieval failed:", error);
    });
}

function extractJobDetails(emailData) {
    // Extract the email snippet (short preview of the body)
    let emailBody = emailData.snippet || "";

    console.log(emailBody);
    // Create an object to store job details
    let jobDetails = {
        messageId: "Unknown",
        company: "Unknown",
        position: "Unknown",
        status: "Waiting",
        receivedDate: "Unknown"
    };

    if (extractCompanyName(emailBody)) jobDetails.company = extractCompanyName(emailBody)[1];
    jobDetails.position = extractJobPosition(emailBody);
    jobDetails.status = determineApplicationStatus(emailBody);
    jobDetails.receivedDate = extractReceivedDate(emailData);

    saveJobData(jobDetails);

    console.log(jobDetails);
    return jobDetails;
}
