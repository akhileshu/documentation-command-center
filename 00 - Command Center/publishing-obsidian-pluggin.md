To publish an Obsidian plugin to the official community directory, you must upload your code to a public GitHub repository, create a release with required build files, and submit it via the official developer portal. [1]  
Here is the exact step-by-step process to get your plugin listed. 
1. Prepare Your Repository 
Your GitHub repository must contain specific files in its root directory for Obsidian to recognize it. 

• : Contains your plugin ID, name, version, minimum Obsidian version, and author details. 
• : The compiled JavaScript entry point of your plugin. 
• : (Optional) Any custom styling your plugin requires. [2, 3, 4, 5, 6]  

2. Create a GitHub Release 
Obsidian pulls your plugin files directly from your repository's releases. 

1. Go to your GitHub repository and click Releases &gt; Draft a new release. 
2. Set the Tag version to match the exact version number in your  (e.g., ). 
3. Build your production assets locally. 
4. Upload exactly three files as release assets: , , and  (if used). 
5. Click Publish release. [8, 9, 10, 11, 12]  

3. Submit to the Community Directory 
Once your release is live, submit it directly through the official portal: 

1. Navigate to the official Obsidian Developer Submission Portal. 
2. Log in using your Obsidian account. 
3. Link your GitHub account to your profile. 
4. Select Plugins in the left sidebar and click New plugin. 
5. Paste the full URL of your public GitHub repository. 
6. Review and accept the Developer Policies, then click Submit. [1]  

4. Code Review & Approval 
After submission, the Obsidian team will review your plugin's source code for performance, security, and compliance with API guidelines. You can track your submission status directly within your portal dashboard. Once approved, it will immediately appear in the Obsidian community settings for all users. 