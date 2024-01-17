import jenkinsapi from "jenkins-api";
import { Octokit } from "octokit";
import color from "chalk";
import progressBar from "@jyeontu/progress-bar";
import select from "@inquirer/select";
import checkbox from "@inquirer/checkbox";
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";
var token = "your jenkins token";
var git_token = "your github token";
var jenkins = jenkinsapi.init(
  `https://qiang.zhu2@bakerhughes.com:${token}@fnptcicd.prd-0000049.pause1.bakerhughes.com`
);
var getBuildInfo = function (ci_name, build_id) {
  return new Promise((resolve) => {
    jenkins.build_info(
      `FnPT/job/Dev/job/${ci_name}`,
      build_id,
      function (err, current_build_info) {
        if (err) {
          return resolve({ error: err });
        } else {
          return resolve(current_build_info);
        }
      }
    );
  });
};
const baseProjects = [
  {
    project_name: "vlm-vk-assetmanagement",
    ci: "vlm-vk-asset-management-ci",
    cd_dev: "eks-vlm-vk-asset-management-cd",
    cd_qa: "eks-vlm-vk-asset-management-cd",
    build_params: {
      BRANCH: "",
      Instruction: "Please read the above instruction",
      Release: "7",
      AppVersion: 0,
      Revision: "",
      BuildType: "Normal",
    },
  },
  {
    project_name: "valves-vlm-proxy-service",
    ci: "vlm-vk-proxy-service-ci",
    cd_dev: "eks-vlm-vk-proxy-service-cd",
    cd_qa: "eks-vlm-vk-proxy-service-cd",
    build_params: {
      BRANCH: "",
      Instruction: "Please read the above instruction",
      Release: "7",
      AppVersion: 0,
      Revision: "",
      BuildType: "Normal",
    },
  },
  {
    project_name: "vlm-vk-am-report",
    ci: "valves-assetmanagement-reports-ci",
    cd_dev: "eks-valves-assetmanagement-reports-cd",
    cd_qa: "eks-valves-assetmanagement-reports-CD",
    build_params: {
      BRANCH: "",
      Instruction: "Please read the above instruction",
      Release: "7",
      AppVersion: 0,
      Revision: "",
      BuildType: "Normal",
    },
  },
];
const octokit = new Octokit({ auth: git_token });
let project_name_list = [];
baseProjects.map((_) => {
  project_name_list.push({ name: _.project_name, value: _.project_name });
});
let project_name = await select({
  message: "Enter your project",
  choices: project_name_list,
});
let selected_project_name = project_name;
let response = await octokit.request("GET /repos/{owner}/{repo}/branches", {
  owner: "bh-ent-tech",
  repo: selected_project_name,
  headers: {
    "X-GitHub-Api-Version": "2022-11-28",
  },
});
var branch = [];
response.data.map((_) => {
  branch.push({ name: _.name, value: _.name, description: "" });
});
let selected_branch = await select({
  message: "enter your branch",
  choices: branch,
});
let selected_project = baseProjects.filter(
  (_) => _.project_name === selected_project_name
)[0];
let params = selected_project.build_params;
params.BRANCH = selected_branch;
let selected_env = await checkbox({
  message: "select  env",
  required: true,
  choices: [
    { name: "dev", value: "dev" },
    { name: "qa", value: "qa" },
  ],
});
console.log(color.green("ok,begin build ci"));
jenkins.last_build_info(
  `FnPT/job/Dev/job/${selected_project.ci}`,
  function (err, last_build_info) {
    if (err) {
      return console.log(err);
    }
    jenkins.build_with_params(
      `FnPT/job/Dev/job/${selected_project.ci}`,
      params,
      function (err, data) {
        if (err) {
          return console.log(err);
        }
        let build_id = last_build_info.number + 1;
        console.log(`build number :${build_id} `);
        let seconds = 1;
        let estimatedDuration = last_build_info.estimatedDuration / 1000;
        const config = {
          duration: estimatedDuration,
          current: 0,
          block: "█",
          showNumber: true,
          tip: {
            0: "inProgress ...",
            50: "inProgress……",
            80: "almost complete ...",
            100: "success",
          },
          color: "blue",
        };
        let progressBarC = new progressBar(config);
        progressBarC.run(seconds);
        let job = setInterval(async () => {
          if (seconds < estimatedDuration) {
            progressBarC.run(seconds);
          }
          var buildInfo = await getBuildInfo(selected_project.ci, build_id);
          if (buildInfo.error && seconds > 30) {
            clearInterval(job);
            console.log(color.red("deploy fail ,unkonw error"));
          } else {
            estimatedDuration = buildInfo.estimatedDuration / 1000;
            config.duration = estimatedDuration;
            progressBarC.initConfig(config);
            switch (buildInfo.result) {
              case "ABORTED":
                progressBarC.run(estimatedDuration);
                console.log(color.red("deploy fail ,ABORTED"));
                clearInterval(job);
                break;
              case "SUCCESS":
                progressBarC.run(estimatedDuration);
                if (selected_env.indexOf("dev") > -1) {
                  console.log(color.green(`begin build dev cd`));
                  jenkins.build_with_params(
                    `FnPT/job/Dev/job/${selected_project.cd_dev}`,
                    {
                      BRANCH: selected_branch,
                      Image_Version: `v7.0.0.${build_id}`,
                    },
                    function (err, data) {
                      if (err) {
                        return console.log(err);
                      }
                    }
                  );
                }
                if (selected_env.indexOf("qa") > -1) {
                  console.log(color.green(`begin build qa cd`));
                  jenkins.build_with_params(
                    `FnPT/job/QA/job/${selected_project.cd_qa}`,
                    {
                      BRANCH: selected_branch,
                      Image_Version: `v7.0.0.${build_id}`,
                    },
                    function (err, data) {
                      if (err) {
                        return console.log(err);
                      }
                    }
                  );
                }
                clearInterval(job);
                break;
            }
          }
          seconds = seconds + 5;
        }, 5000);
      }
    );
  }
);
