
function authenticateUser() {
    // Request an OAuth token using chrome.identity API
    // Handle authentication success or failure

    //Get the authentication token by having the user login to their google
    return new Promise((resolve, reject) => {chrome.identity.getAuthToken({interactive: true}, (token) => {
        if (chrome.runtime.lastError) {
            console.error("Authenication Failed:", chrome.runtime.lastError.messages);
            reject(chrome.runtime.lastError);
        } else {
            resolve(token);
            }
        });
    });
}

async function getAccessToken() {
    // Check if a token already exists
    // If not, request a new token using authenticateUser()
    // Return the access token for future API requests
    // console.log("Checking for existing access token");

    //create a promise to see if we can get the token without user login
    try {
        return await new Promise((resolve, reject) => {chrome.identity.getAuthToken({ interactive: false }, (token) => {
            if (chrome.runtime.lastError) {
                console.error("Error retrieving token:", chrome.runtime.lastError);
                token = authenticateUser();
                // console.log("Access token retrieved:", token);
                reject(chrome.runtime.lastError);
            } else {
                // console.log("Access token retrieved:", token);
                resolve(token);
            }
            });
        });
    // if failed just have the user login to get the login token
    } catch(error){
        try {
            await authenticateUser();
        } catch (authError){
            console.error("Authentication Failed:", authError);
            throw authError;
        }

    }
}

// find and store the job app in the local storage
// DOES NOT ADD THE PROPERITIES OF THE JOB APP IN THIS
function storeJobApplication(JobApplication){

    //Create a unqiue storagekey based on the company name and the job title
    const storagekey = createStoragekey(JobApplication);

    //checking if the job application is in the storage
    chrome.storage.local.get(storagekey, function(result){
        // if the job application is not in storage
        if(Object.keys(result).length === 0) {
            chrome.storage.local.set({[storagekey]: JobApplication}, function() {
                // console.log("Job log:", JobApplication.id);
                updateJobApplicationIndex(storagekey);
            });
        } else {
            // if the job application is in storage
            const exisiting = result[storagekey];
            const statusChange = exisiting.state.currentStatus !== JobApplication.state.currentStatus;
            const dateChange = exisiting.jobDetail.ApplicationDate < JobApplication.state.ApplicationDate;
            // if there is a change in the job application
            if (statusChange || dateChange){
                updateJobApplication = {
                    ...exisiting,
                    state: JobApplication.state.currentStatus,
                    lastUpdate: new Date().toISOString(),
                }
                chrome.storage.local.set({[storagekey]: updateJobApplication});
            } else {
                console.log("No Update to:", JobApplication);
            }

            // if ((JSON.stringify(exisiting.state) !== JSON.stringify(JobApplication.state)) && (JSON.stringify(exisiting.JobTitle) === JSON.stringify(JobApplication.JobTitle))){
            //     JobApplication.lastUpdate = new Date().toISOString;
            //     chrome.storage.local.set({[JobApplication.id]: JobApplication}, function(){
            //         console.log("Update the JobApplication Time:", JobApplication.lastUpdate);
            //     });
            // } else {
            //     console.log("No Update to:", JobApplication);
            // }
        }
    });
}

function createStoragekey(JobApplication){
    return `job_${
        JobApplication.jobDetail.JobTitle || 'Unknown'
    }_${
        JobApplication.jobDetail.companyName || 'Unknown'
    }`;
}

//take the job id and update the list
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
                // console.log("Rate limit hit (429 error). Waiting longer before retry...");
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
        // console.log("Using token: ", token);

        fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?q=subject:+application", {
            headers: { Authorization: `Bearer ${token}` }
        })
        //convert to json
        .then(response => response.json())
        .then(data => {
            // console.log("Gmail API response:", data);
            //check if there is a message
            if (data.messages && data.messages.length > 0) {
                processMessages(data.messages, token, 0, emailNum);
              } else {
                // console.log('No messages found.');
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

    // Common word phrases to look through
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

    // Go through each status
    for (const [status, phrases] of Object.entries(statusPatterns)){
        // Go through each phrases
        for (const phrase of phrases){
            // if the content include the phrases then reutrn it
            if (content.includes(phrase)){
                return status;
            }
        }
    }
    // reutrn unknown
    return "Unknown";
}

function extractJobDetails(emailData) {
    //Check if the email is a multipart or simple text
    let status = "Uknown";
    let raw = "";
    // console.log("Mimetype:", emailData.payload.mimeType);
    if (emailData.payload.mimeType === "text/plain" || emailData.payload.mimeType === "text/html"){
        // console.log("Mimetype:", emailData.payload.mimeType);
        const content = emailData.payload.body.data;
        try {
            raw = decoderBased64(content);
            status = CheckStatusApplication(raw);
            // console.log("Raw:", raw);
        } catch (error){
            console.error("The error:", error);
        }
        // console.log("Raw body:", raw);
    } else if (emailData.payload.mimeType.startsWith("multipart/")){
        //for each part of the email decode it 
        for (const part of emailData.payload.parts){
            if(part.mimeType === "text/plain" || part.mimeType === "text/html"){
                const content = part.body.data;
                raw = decoderBased64(content);
                status = CheckStatusApplication(raw);
                // console.log("Raw:", raw);
                break;
            }
        }
    }

    const fromHeader = emailData.payload.headers.find(header => header.name === "From");
    const fromSubject = emailData.payload.headers.find(header => header.name === "Subject");
    const fromDate = emailData.payload.headers.find(header => header.name === "Date");

    extractJobName();

    // Make the object
    jobApplicationObject = {
        id : emailData.id,
        jobDetail : {
            companyName : "Uknown",
            JobTitle : "Title",
            ApplicationDate : new Date(fromDate?.value || Date.now()).toISOString(),
            SourceEmail : fromHeader?.value || "Unknown Sender",
            subject : fromSubject?.value || "No Subject",
        },
        state: {
            currentStatus : status || "Unknown",
            lastUpdate : new Date(fromDate?.value || Date.now()).toISOString()
        }
    }

    storeJobApplication(jobApplicationObject);

    console.log("Job Application Details:", JSON.stringify(jobApplicationObject, null, 2))
    return jobApplicationObject;

}

function extractJobName(fromEmail, subject){
    if(fromEmail){
        const emailDomain = fromEmail.split('@')[1];
        console.log(emailDomain);   
    }
    if (subject){
        const subjectlog = subject.
    }

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


