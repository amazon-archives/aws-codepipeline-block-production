/*
 * Copyright 2016 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 *  http://aws.amazon.com/apache2.0
 *
 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */
var aws = require('aws-sdk');
var codepipeline = new aws.CodePipeline();
var ddb = new aws.DynamoDB.DocumentClient();
var cloudwatch = new aws.CloudWatch();

const PIPELINE_APPROVAL_DDB_TABLE = "BlockProductionDemo-PipelineApprovals";
const APPROVED = "Approved";
const REJECTED = "Rejected";
const WAIT = "Wait";

exports.handler = (event, context, callback) => {

  var approvalResult = function(result, reason) {
    return {
      status : result,
      summary : reason
    }
  };

  var cleanUpFinishedApproval = function(approvalToken) {
    return ddb.delete({
      TableName: PIPELINE_APPROVAL_DDB_TABLE,
      Key: {
        ApprovalToken: approvalToken
      }
    }).promise();
  };

  var completeApproval = function(approval, resultDetails) {

    var approvalResult = {
      pipelineName: approval.pipelineName,
      stageName: approval.stageName,
      actionName: approval.actionName,
      token: approval.token,
      result: resultDetails
    };

    console.log("Completing canary approval for approval token: " + approvalResult.token);

    return new Promise(function(resolve, reject) {
      codepipeline.putApprovalResult(approvalResult, function(err, data) {
        cleanUpFinishedApproval(approvalResult.token).then(function() {
          if (err) {
            console.log("Error putting approval result: " + JSON.stringify(err));
            reject(err);
          } else {
            resolve(data);
          }
        }, function(err) {
          console.log("Error deleting the record: " + JSON.stringify(err));
          reject(err);
        });
      });
    });
  };

  var hasCanaryApprovalTimedOut = function (canaryApprovalConfig, startTime) {
      var expiry = new Date(startTime + canaryApprovalConfig.timeoutMinutes*60000);
      return new Date() > expiry;
  };

  var areSyntheticTestsInAlarm = function() {
    return cloudwatch.describeAlarms({
      AlarmNames : [process.env.SYNTHETIC_TESTS_ALARM]
    }).promise().then(function (data) {
      var metricAlarm = data.MetricAlarms[0];
      if(metricAlarm.StateValue === 'OK') {
        return Promise.resolve(true);
      } else {
        return Promise.resolve(false);
      }
    }).catch(function (err) {
        console.log("Error getting alarm status. Error: " + JSON.stringify(err));
        return Promise.reject(err);
    });
  };

  var evaluateMetrics = function (canaryApprovalConfig, startTime) {
      var now = new Date();
      var start = new Date(startTime);
      var period = Math.round((now - start) / 1000);
      period = period - (period % 60); // Round down to nearest multiple of 60

      var params = {
          EndTime: now.toISOString(),
          StartTime: start.toISOString(),
          Statistics: ['Sum'],
          Namespace: process.env.METRIC_NAMESPACE,
          MetricName: process.env.METRIC_NAME,
          Period: period,
          Dimensions: [
              {
                  Name: process.env.DIMENSION_NAME,
                  Value: process.env.DIMENSION_VALUE
              }
          ]
      };

      return cloudwatch.getMetricStatistics(params).promise()
        .then(function (data) {
            var totalMetrics = data.Datapoints.reduce(function (a, b) {
              return a + b.Sum;
            }, 0);

            if (totalMetrics >= canaryApprovalConfig.metricsRequired) {
              console.log("Got required " + canaryApprovalConfig.metricsRequired + " metrics.");
              return Promise.resolve(approvalResult(APPROVED, "Got required " + canaryApprovalConfig.metricsRequired + " metrics."));
            } else {
              console.log("Got only " + totalMetrics + " metrics. Required: " + canaryApprovalConfig.metricsRequired + ". Waiting for more metrics...");
              return Promise.resolve(WAIT);
            }
        }).catch(function (err) {
          console.log("Error getting metrics data. Error: " + JSON.stringify(err));
          return Promise.reject();
        });
  };

  var evaluateCanaryPerformance = function(record) {
    var approvalToken = record.ApprovalToken;
    var canaryApprovalConfig = JSON.parse(record.ApprovalContent.customData);

    if(!canaryApprovalConfig || !canaryApprovalConfig.metricsRequired || !canaryApprovalConfig.timeoutMinutes) {
      return Promise.resolve(approvalResult(REJECTED, "No canary approval configuration found."));
    }

    console.log("Evaluating canary configuration: " + JSON.stringify(canaryApprovalConfig) + " for approval token: " + approvalToken);

    if(hasCanaryApprovalTimedOut(canaryApprovalConfig, record.StartTime)) {
        return Promise.resolve(approvalResult(REJECTED, "Did not receive required number of metrics within the configured timeout."));
    } else {
        return areSyntheticTestsInAlarm()
        .then(function(isAlarmOk) {
          if(isAlarmOk) {
            return evaluateMetrics(canaryApprovalConfig, record.StartTime);
          } else {
            return Promise.resolve(approvalResult(REJECTED, "Alarm: " + process.env.SYNTHETIC_TESTS_ALARM + " was found in non OK state."));
          }
        }).catch(function (err) {
          console.log("Error evaluating canary performance. Error: " + JSON.stringify(err));
          return Promise.reject(err);
        });
    }
  };

  var processRecord = function(record) {
    return evaluateCanaryPerformance(record)
      .then(function (result) {
          if(result === WAIT) {
            return Promise.resolve();
          } else {
            return completeApproval(record.ApprovalContent, result);
          }
      }).catch(function(err) {
        console.log("Error processing canary approval record. Error: " + JSON.stringify(err));
        return Promise.reject(err);
      });
  };

  var processRecords = function(data) {
    var processRecordPromises = [];

    data.Items.forEach(function(record) {
      processRecordPromises.push(processRecord(record));
    });

    return new Promise(function(resolve, reject) {
      Promise.all(processRecordPromises)
        .then(function() {
          // continue scanning if we have more records
          if (typeof data.LastEvaluatedKey != "undefined") {
            console.log("Scanning for more...");
            resolve(scanAndProcessRecords(data.LastEvaluatedKey));
          } else {
            resolve();
          }
        }).catch(function(err) {
          reject(err);
        });
    });
  };

  var scanAndProcessRecords = function (lastEvaluatedKey) {
    return ddb.scan({
        TableName: PIPELINE_APPROVAL_DDB_TABLE,
        ExclusiveStartKey: lastEvaluatedKey
    }).promise()
    .then(function(data) {
        return processRecords(data);
    }).catch(function(err) {
        console.log("Error processing canary approval requests. Error: " + JSON.stringify(err));
        return Promise.reject(err);
    });
  }

  scanAndProcessRecords()
    .then(function() {
      callback(null, "Successfully processed all canary approval requests.");
    }).catch(function(err) {
      console.log("Error processing canary approval requests. Error: " + JSON.stringify(err));
      callback(err, "Error processing canary approval requests.");
    });
};
