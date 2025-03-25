
function authenticateUser() {
    // Request an OAuth token using chrome.identity API
    // Handle authentication success or failure
    chrome.identity.getAuthToken({interactive: true}, (token) => {
        if (chrome.runtime.lastError){
            console.error("Authenication Failed: ", chrome.runtime.lastError.message);
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

            const jobApplicationObject = extractJobDetails(fullMessage);

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

//Check the status of each parts that is given
function CheckStatusApplication(emailContent){
    const content = emailContent.toLowerCase();

    const statusPatterns = {
        'accepted': [
          'congratulations', 'you have been accepted'
        ],
        'rejected': [
          'unfortunately', 'regret to inform', 'cannot offer', 'not selected', 
          'we are sorry', 'not able to offer', 'not successful', 'other candidates',
          'position has been filled'
        ],
        'interview': [
          'interview invitation', 'would like to interview', 'schedule an interview',
          'invite you to interview'
        ],
        'pending': [
            'under review', 'application received', 'processing', 
            'reviewing', 'in progress', 'we are reviewing', 
            'application status', 'currently evaluating', 'application under consideration',
            'thank you for applying','received'
        ]
    };
    
    for (const [status, phrases] of Object.entries(statusPatterns)){
        for (const phrase of phrases){
            if (content.includes(phrase)){
                return status;
            }
        }
    }
    return "Unknown";
}

function extractJobDetails(emailData) {
    //Check if the email is a multipart or simple text
    let status = "Uknown";
    let raw = "";
    console.log("Mimetype:", emailData.payload.mimeType);
    if (emailData.payload.mimeType === "text/plain" || emailData.payload.mimeType === "text/html"){
        console.log("Mimetype:", emailData.payload.mimeType);
        const content = emailData.payload.body.data;
        try {
            raw = decoderBased64(content);
            status = CheckStatusApplication(raw);
            // console.log("Raw:", raw);
        } catch (error){
            console.error("The error:", error);
        }
        console.log("Raw body:", raw);
    } else if (emailData.payload.mimeType.startsWith("multipart/")){
        //for each part of the email decode it 
        for (const part of emailData.payload.parts){
            if(part.mimeType === "text/plain" || part.mimeType === "text/html"){
                const content = part.body.data;
                raw = decoderBased64(content);
                status = CheckStatusApplication(raw);
                // console.log("Raw:", raw);
            }
        }
    }

    // Make the object
    jobApplicationObject = {
        id : emailData.id,
        subject : emailData.payload.headers.find(header => header.name === "Subject")?.value || "No Subject",
        sender : emailData.payload.headers.find(header => header.name === "From")?.value || "Unknown Sender",
        date : new Date(emailData.payload.headers.find(header => header.name === "Date")?.value || Date.now()).toISOString(),
        lastUpdate: new Date(emailData.payload.headers.find(header => header.name === "Date")?.value || Date.now()).toISOString(),
        state: status
    }

    storeJobApplication(jobApplicationObject);

    console.log("Id:", jobApplicationObject.id);
    console.log("Subject:", jobApplicationObject.subject);
    console.log("Sender:", jobApplicationObject.sender);
    console.log("date:", jobApplicationObject.date);
    console.log("lastUpdate:", jobApplicationObject.lastUpdate);
    console.log("state:", jobApplicationObject.state);

    return jobApplicationObject;

}

// Decode the based64 to be able to parse through the message
function decoderBased64(encodedData){
    //check if the encodeddata is a string or if there is something there
    try {
        if (!encodedData || typeof encodedData !== "string"){
            console.log("invalid code:", encodedData);
            return "";
        }
        //replace all the url safe characters
        const Based64safe = encodedData.replace(/-/g, "+").replace(/_/g, "/");

        //decode to binary string
        const binary = atob(Based64safe);

        //Takes the bianry string and take each character and 
        //place them into the position at their locations
        //We need this for the Textdecoder since that is what is needed
        const byte = new Uint8Array(binary.length);
        for(let i = 0; i< byte.length; i++){
            byte[i] = binary.charCodeAt(i);
        }
        
        return new TextDecoder('utf-8').decode(byte);
    } catch (error){
        console.error("The decoder error", error);
        return ""
    }
}


