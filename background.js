import { getAccessToken } from './auth-utils.js';


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
                const updateJobApplication = {
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

function fetchEmails(search_Que = "category:updates 'application' AND -alert OR 'position' AND -alert ") {
    // Call getAccessToken() to retrieve a valid token
    // Use the token to send a request to the Gmail API
    // Retrieve job application emails

    getAccessToken().then(token => {
        let emailNum = 0;
        // console.log("Using token: ", token);

        fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${search_Que}`, {
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

    console.log("Header:", fromHeader.value);
    console.log("Subject", fromSubject.value);

    // Make the object
    const jobApplicationObject = {
        id : emailData.id,
        jobDetail : {
            companyName : extractJobName(fromHeader.value, fromSubject.value) || "Unknown Company Name",
            JobTitle : extractJobTitle(raw) || "Unknown Title",
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

//take the header and the subject from the payload
//return the company name
function extractJobName(fromEmail, subject){
    if(fromEmail && fromEmail !== "Indeed Apply <indeedapply@indeed.com>"){
        const domain = fromEmail.split('@')[1];
        const parts = domain.split('.');
        if (parts.length > 2) {
            return parts[parts.length - 2];
        }
        return parts[0];
    }
    if(subject){
        return subject;
    }
    return null;
}

//take the data from the body and extract the job title
function extractJobTitle(rawData){
    
    const Jobtitle = [
    // Entry-Level Positions
    "Junior Software Developer", "Marketing Coordinator", "Customer Service Representative", "Sales Associate",
    "Administrative Assistant", "Data Entry Clerk", "Graphic Design Assistant", "Social Media Coordinator",
    "Human Resources Assistant", "Production Assistant", "Junior Accountant", "Help Desk Technician", 
    "Research Assistant", "Junior Copywriter",

    // Technology Roles
    "Software Engineer", "Web Developer", "Mobile App Developer", "Cloud Solutions Architect", "Cybersecurity Analyst",
    "Network Engineer", "Database Administrator", "DevOps Engineer", "Machine Learning Engineer", "Full Stack Developer",
    "Front-end Developer", "Back-end Developer", "UI/UX Designer", "IT Support Specialist", "Systems Administrator",
    "QA Engineer", "Product Manager", "Technical Project Manager", "Data Scientist", "Business Intelligence Analyst",

    // Business & Finance
    "Financial Analyst", "Investment Banker", "Management Consultant", "Business Development Manager",
    "Account Manager", "Sales Representative", "Marketing Manager", "Operations Coordinator", "Project Coordinator",
    "Supply Chain Analyst", "Procurement Specialist", "Business Analyst", "Risk Analyst", "Compliance Officer",
    "Treasury Analyst", "Corporate Strategy Analyst",

    // Healthcare
    "Registered Nurse", "Physician", "Medical Assistant", "Healthcare Administrator", "Physical Therapist",
    "Occupational Therapist", "Pharmacist", "Dental Hygienist", "Radiologic Technologist", "Mental Health Counselor",
    "Clinical Research Coordinator", "Healthcare Data Analyst", "Medical Billing Specialist", "Public Health Coordinator",
    "Emergency Medical Technician",

    // Creative & Media
    "Graphic Designer", "Content Writer", "Social Media Manager", "Digital Marketing Specialist", 
    "Video Editor", "Photographer", "Art Director", "UX/UI Designer", "Copywriter", "Public Relations Specialist",
    "Brand Manager", "Creative Director", "Multimedia Specialist", "Animation Artist", "Technical Writer",

    // Education
    "Elementary School Teacher", "High School Teacher", "College Professor", "Curriculum Developer",
    "Educational Consultant", "School Counselor", "Academic Advisor", "Online Tutor", "Special Education Instructor",
    "Corporate Trainer", "Instructional Designer", "Education Program Manager", "Research Educator",
    "Educational Technology Specialist",

    // Engineering
    "Mechanical Engineer", "Electrical Engineer", "Civil Engineer", "Chemical Engineer", "Aerospace Engineer",
    "Environmental Engineer", "Biomedical Engineer", "Software Engineer", "Data Engineer", "Robotics Engineer",
    "Quality Assurance Engineer", "Structural Engineer", "Process Engineer", "Product Design Engineer",
    "Research and Development Engineer",

    // Hospitality & Service
    "Restaurant Manager", "Hotel Manager", "Event Coordinator", "Hospitality Supervisor", "Chef",
    "Bartender", "Customer Experience Manager", "Travel Consultant", "Catering Manager", "Front Desk Coordinator",
    "Guest Relations Specialist", "Food and Beverage Manager", "Tour Guide", "Concierge",

    // Legal & Compliance
    "Paralegal", "Legal Assistant", "Compliance Officer", "Contract Administrator", "Legal Consultant",
    "Regulatory Affairs Specialist", "Corporate Counsel", "Intellectual Property Specialist", "Compliance Analyst",
    "Risk Management Specialist",

    // Sales & Retail
    "Sales Representative", "Retail Manager", "Account Executive", "Business Development Representative",
    "Sales Operations Analyst", "Retail Sales Associate", "Retail Buyer", "E-commerce Specialist",
    "Inside Sales Representative", "Outside Sales Representative", "Channel Sales Manager", "Sales Training Specialist",

    // Science & Research
    "Research Scientist", "Laboratory Technician", "Clinical Research Associate", "Biotechnology Researcher",
    "Environmental Scientist", "Pharmaceutical Researcher", "Forensic Scientist", "Data Research Analyst",
    "Scientific Writer", "Research Project Manager",

    // Human Resources
    "HR Coordinator", "Recruitment Specialist", "Employee Relations Manager", "Training and Development Specialist",
    "Benefits Coordinator", "Talent Acquisition Specialist", "HR Business Partner", "Compensation Analyst",
    "Diversity and Inclusion Coordinator", "HR Operations Manager",

    // Transportation & Logistics
    "Logistics Coordinator", "Supply Chain Manager", "Warehouse Manager", "Transportation Analyst",
    "Fleet Manager", "Shipping Coordinator", "Inventory Specialist", "Procurement Specialist",
    "Logistics Sales Representative", "Operations Supervisor",

    // Non-Profit & Social Services
    "Program Coordinator", "Grant Writer", "Community Outreach Specialist", "Fundraising Manager",
    "Social Worker", "Non-Profit Administrator", "Volunteer Coordinator", "Development Director",
    "Impact Analyst", "Community Relations Manager",

    // Remote & Emerging Roles
    "Remote Project Manager", "Digital Nomad", "Virtual Assistant", "Remote Customer Support",
    "Freelance Consultant", "Online Content Creator", "Remote Sales Representative", "Blockchain Specialist",
    "AI Ethics Consultant", "Remote Learning Facilitator"
    ];

    for (const title of Jobtitle){
        if (rawData.includes(title)){
            return title
        }
    }
    return null;
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

self.fetchEmails = fetchEmails;