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
var aws = require("aws-sdk");
var ddb = new aws.DynamoDB.DocumentClient();
const PIPELINE_APPROVAL_DDB_TABLE = "BlockProductionDemo-PipelineApprovals";

exports.handler = (event, context, callback) => {

  if (event.Records[0]) {
    var notificationData = JSON.parse(event.Records[0].Sns.Message);
    ddb.put({
      TableName: PIPELINE_APPROVAL_DDB_TABLE,
      Item: {
        ApprovalToken: notificationData.approval.token,
        ApprovalContent: notificationData.approval,
        StartTime: new Date().getTime()
      }
    }, function(err, data) {
      if (err) {
        var message = "Unable to register pipeline approval request. Error JSON:" + JSON.stringify(err);
        console.error(message);
        callback(error, message);
      } else {
        var message = "Successfully registered pipeline approval request: " + JSON.stringify(notificationData.approval);
        console.log(message);
        callback(null, message);
      }
    });
  } else {
    callback(null);
  }
};
