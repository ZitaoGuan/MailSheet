
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

function delay(time){
    return new Promise(resolve => setTimeout(resolve, time));
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
                data.messages.forEach(async message => {
                // Another fetch to see the message
                await delay(1000);
                try {fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}`, {
                    method: 'GET',
                    headers: {
                    Authorization: `Bearer ${token}`,
                    },
                })
                .then(response => response.json())
                .then(fullMessage => {
                    console.log('Full Message:', fullMessage);
                    const subject = fullMessage.payload.headers.find(header => header.name === "Subject")?.value;
                    const sender = fullMessage.payload.headers.find(header => header.name === "From")?.value;
                    const date = fullMessage.payload.headers.find(header => header.name === "Date")?.value;
                    console.log('Subject:', subject);
                    console.log('Sender:', sender);
                    console.log('Date:', date);
                    console.log('Email Number:', emailNum);
                    emailNum++;

                    // Access specific data like the subject, sender, and body
                    // const subject = fullMessage.payload.headers.find(header => header.name === 'Subject')?.value;
                    // const sender = fullMessage.payload.headers.find(header => header.name === 'From')?.value;
                    // const body = atob(fullMessage.payload.parts[0].body.data.replace(/-/g, '+').replace(/_/g, '/'));
        
                    // console.log('Subject:', subject);
                    // console.log('Sender:', sender);
                    // console.log('Body:', body);
                    })} catch (error){
                        console.error("Error fetching email details:", error);
                    };
                });
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

function extractCompanyName(emailBody) {
    // Use regex or keyword matching to find the company name
    const regex = /at (.*?)\./i;
    const matches = emailBody.match(regex);
    console.log(matches.filter(match => match.trim() !== ""));
    return matches ? matches.filter(match => match.trim() !== "") : [];
}

function extractJobPosition(emailBody) {
    // Use regex or keyword matching to find the job title
    const regex = /at (.*?)\./i;
    const matches = emailBody.match(regex);

}

function determineApplicationStatus(emailBody) {
    // Check for specific keywords to classify the status as Waiting, Rejected, or Accepted
}

function extractReceivedDate(emailData) {
    // Convert Gmail's internal timestamp to a readable date format
}
